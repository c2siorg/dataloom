"""Background job endpoints: submit slow work, poll its progress, cancel it.

Every route is owner-scoped with existence-hiding 404s, and none of them takes a
project lock or reads project data, so polling stays fast while a job holds the
project's write lock.
"""

import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import fetch_owned_project, get_current_user
from app.config import get_settings
from app.jobs.registry import JOB_REGISTRY
from app.jobs.runner import runner
from app.services import job_service
from app.utils.logging import request_id_var

router = APIRouter()


def job_response(job: models.Job) -> schemas.JobResponse:
    """Shape a job row for the client."""
    return schemas.JobResponse(
        id=job.id,
        project_id=job.project_id,
        kind=job.kind,
        is_exclusive=job.is_exclusive,
        status=job.status,
        params=job.params,
        progress=schemas.JobProgress(
            current=job.progress_current,
            total=job.progress_total,
            message=job.progress_message,
        ),
        result=job.result,
        error=job.error,
        cancel_requested=job.cancel_requested,
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


@router.post("/projects/{project_id}/jobs", status_code=202, response_model=schemas.JobResponse)
def submit_job(
    project_id: uuid.UUID,
    response: Response,
    body: schemas.JobCreateRequest = Body(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Queue slow work on a project and return at once with the job to poll.

    Everything the job will reference is checked here, so a bad pipeline or
    checkpoint id is a 404 now rather than a failed job later.
    """
    project = fetch_owned_project(db, project_id, current_user)
    spec = JOB_REGISTRY[body.kind]
    params = spec.params_model.model_validate(body.model_dump(exclude={"kind"}))
    spec.validate(db, project, params, current_user)

    if not runner.accepting:
        raise HTTPException(status_code=503, detail="The server is shutting down. Try again shortly.")

    settings = get_settings()
    job = job_service.create_job(
        db,
        owner_id=current_user.id,
        project_id=project.project_id,
        kind=body.kind.value,
        is_exclusive=spec.exclusive,
        params=params.model_dump(mode="json"),
        max_active_per_user=settings.job_max_active_per_user,
    )
    job_service.purge_expired_jobs_if_due(runner.session_factory, settings.job_retention_days)

    try:
        runner.submit(job.id, request_id_var.get())
    except RuntimeError as e:
        # Shutdown began after the check above; the next startup's recovery
        # reports the row as interrupted.
        db.delete(job)
        db.commit()
        raise HTTPException(status_code=503, detail="The server is shutting down. Try again shortly.") from e

    db.refresh(job)
    response.headers["Location"] = f"/jobs/{job.id}"
    return job_response(job)


@router.get("/jobs/{job_id}", response_model=schemas.JobResponse)
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Poll one job's status and progress."""
    return job_response(job_service.get_owned_job(db, job_id, current_user))


@router.get("/projects/{project_id}/jobs", response_model=list[schemas.JobResponse])
def list_project_jobs(
    project_id: uuid.UUID,
    active: bool = Query(False, description="Only queued and running jobs."),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List a project's jobs, newest first — how a reloaded workspace finds a running job."""
    project = fetch_owned_project(db, project_id, current_user)
    return [job_response(job) for job in job_service.list_project_jobs(db, project.project_id, active_only=active)]


@router.post("/jobs/{job_id}/cancel", status_code=202, response_model=schemas.JobResponse)
def cancel_job(
    job_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Cancel a queued job now, or ask a running one to stop before it writes.

    A running job stops at its next step boundary and ends ``cancelled``; one
    that has already started writing finishes and ends ``succeeded`` with
    ``cancel_requested`` set.
    """
    job = job_service.get_owned_job(db, job_id, current_user)
    job = job_service.request_cancel(db, job)
    runner.request_cancel(job.id)
    return job_response(job)
