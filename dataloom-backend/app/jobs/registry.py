"""The kinds of work that run as Jobs, and the function behind each.

Mirrors ``TRANSFORMATION_REGISTRY``: the client names a ``JobKind`` and its
parameters, and this registry decides what runs. A run function plays the role
an endpoint plays for the synchronous path — it takes the same project lock in
the same order, reads through the same redacting reader, and calls the same
service function, handing it plain callables for progress and cancellation.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlmodel import Session

from app import models
from app.api.dependencies import fetch_owned_pipeline, read_project_df
from app.jobs.context import JobContext, JobFailed
from app.schemas import JobKind, PipelineRunJobParams, RevertJobParams
from app.services import pipeline_service, project_service
from app.services.job_service import ClaimedJob
from app.utils.project_locks import project_write_lock

READING_MESSAGE = "Reading project data"
PROJECT_GONE = "The project was deleted while this job was running."


@dataclass(frozen=True)
class JobSpec:
    """How one kind of job validates and runs.

    Attributes:
        label: Human-readable name of the work, for logs and the client.
        exclusive: Whether the job rewrites the project. At most one exclusive
            job per project may be active, and the synchronous writes it
            overlaps answer 409 while it is.
        params_model: Validates the stored parameters.
        validate: Called at submit with the request's Session, so a bad
            reference is a 404 then rather than a failed job later.
        run: Does the work in a worker thread. Returns a small, JSON-safe result.
    """

    label: str
    exclusive: bool
    params_model: type[BaseModel]
    validate: Callable[[Session, models.Project, Any, models.User], None]
    run: Callable[[JobContext, Session, ClaimedJob], dict[str, Any]]


def _load_project(session: Session, job: ClaimedJob) -> models.Project:
    project = session.get(models.Project, job.project_id)
    if project is None:
        raise JobFailed(PROJECT_GONE)
    return project


def _before_commit(ctx: JobContext, session: Session, project: models.Project) -> Callable[[], None]:
    """The last stop before the first write: honour a pending cancel, then check the project survived.

    Queries rather than ``session.get``, which would answer from the identity
    map instead of noticing a delete.
    """

    def hook() -> None:
        ctx.enter_commit_phase()
        still_there = session.scalar(
            select(models.Project.project_id).where(models.Project.project_id == project.project_id)
        )
        if still_there is None:
            raise JobFailed(PROJECT_GONE)

    return hook


def _validate_pipeline_run(
    db: Session, project: models.Project, params: PipelineRunJobParams, user: models.User
) -> None:
    fetch_owned_pipeline(db, params.pipeline_id, user)


def _run_pipeline(ctx: JobContext, session: Session, job: ClaimedJob) -> dict[str, Any]:
    params = PipelineRunJobParams.model_validate(job.params)
    project = _load_project(session, job)
    pipeline = session.get(models.Pipeline, params.pipeline_id)
    if pipeline is None:
        raise JobFailed("The pipeline was deleted before the Run started.")
    steps = pipeline_service.pipeline_steps(pipeline)
    ctx.set_total(len(steps))
    session.commit()

    # Same lock, same order as POST /pipelines/{id}/apply: read, replay and write
    # under one exclusive hold (see the comment there).
    with project_write_lock(project.project_id):
        ctx.stage(READING_MESSAGE)
        df = read_project_df(project)
        result_df = pipeline_service.apply_pipeline_to_project(
            session,
            project,
            pipeline,
            df,
            on_step=ctx.replay_hook,
            before_commit=_before_commit(ctx, session, project),
        )
    return {"steps": len(steps), "rows": len(result_df), "columns": len(result_df.columns)}


def _validate_revert(db: Session, project: models.Project, params: RevertJobParams, user: models.User) -> None:
    if params.checkpoint_id is None:
        return
    checkpoint = db.scalar(
        select(models.Checkpoint.id).where(
            models.Checkpoint.id == params.checkpoint_id,
            models.Checkpoint.project_id == project.project_id,
        )
    )
    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")


def _run_revert(ctx: JobContext, session: Session, job: ClaimedJob) -> dict[str, Any]:
    params = RevertJobParams.model_validate(job.params)
    project = _load_project(session, job)
    session.commit()

    # Same lock as POST /projects/{id}/revert.
    with project_write_lock(project.project_id):
        ctx.stage(READING_MESSAGE)
        df = project_service.revert_project(
            session,
            project,
            params.checkpoint_id,
            on_step=ctx.replay_hook,
            before_commit=_before_commit(ctx, session, project),
        )
    return {"steps": ctx.total or 0, "rows": len(df), "columns": len(df.columns)}


JOB_REGISTRY: dict[JobKind, JobSpec] = {
    JobKind.pipelineRun: JobSpec(
        label="Pipeline Run",
        exclusive=True,
        params_model=PipelineRunJobParams,
        validate=_validate_pipeline_run,
        run=_run_pipeline,
    ),
    JobKind.revert: JobSpec(
        label="Revert",
        exclusive=True,
        params_model=RevertJobParams,
        validate=_validate_revert,
        run=_run_revert,
    ),
}

_missing = set(JobKind) - set(JOB_REGISTRY)
if _missing:
    raise RuntimeError(f"JobKind members missing a JOB_REGISTRY entry: {sorted(_missing)}")
