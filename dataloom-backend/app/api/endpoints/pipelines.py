"""Pipeline API endpoints: save, list, check, apply, and delete pipelines."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import selectinload
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import (
    fetch_owned_pipeline,
    fetch_owned_project,
    get_current_user,
    load_project_df,
    read_project_df,
)
from app.services import pipeline_service
from app.services.transformation_service import TransformationError
from app.utils.pandas_helpers import dataframe_to_response, paginate_dataframe
from app.utils.project_locks import project_write_lock
from app.utils.security import safe_transformation_error_detail

router = APIRouter()


@router.post("", response_model=schemas.PipelineResponse)
def create_pipeline(
    body: schemas.PipelineCreateRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Save an ordered list of transformation steps as a reusable pipeline."""
    fetch_owned_project(db, body.project_id, current_user)
    return pipeline_service.create_pipeline_from_steps(db, current_user.id, body.name, body.description, body.steps)


@router.get("", response_model=list[schemas.PipelineResponse])
def list_pipelines(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List the current user's pipelines, newest first."""
    return (
        db.query(models.Pipeline)
        .options(selectinload(models.Pipeline.steps))
        .filter(models.Pipeline.owner_id == current_user.id)
        .order_by(models.Pipeline.created_at.desc())
        .all()
    )


@router.delete("/{pipeline_id}")
def delete_pipeline(
    pipeline_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a pipeline and its steps."""
    pipeline = fetch_owned_pipeline(db, pipeline_id, current_user)
    db.delete(pipeline)
    db.commit()
    return {"success": True, "message": "Pipeline deleted"}


@router.post("/check-steps", response_model=schemas.PipelineCompatibilityResponse)
def check_steps(
    body: schemas.PipelineCheckStepsRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Dry-run an unsaved list of draft steps against a project (before saving)."""
    project = fetch_owned_project(db, body.project_id, current_user)
    df = load_project_df(project)
    return pipeline_service.check_steps_compatibility(
        df, [(step.action_type, step.action_details) for step in body.steps]
    )


@router.post("/{pipeline_id}/check", response_model=schemas.PipelineCompatibilityResponse)
def check_pipeline(
    pipeline_id: uuid.UUID,
    body: schemas.PipelineApplyRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Dry-run a pipeline against a project and report the first failing step."""
    pipeline = fetch_owned_pipeline(db, pipeline_id, current_user)
    project = fetch_owned_project(db, body.project_id, current_user)
    df = load_project_df(project)
    return pipeline_service.check_steps_compatibility(df, pipeline_service.pipeline_steps(pipeline))


@router.post("/{pipeline_id}/apply", response_model=schemas.BasicQueryResponse)
def apply_pipeline(
    pipeline_id: uuid.UUID,
    body: schemas.PipelineApplyRequest,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Replay a pipeline's steps onto a project and log each step."""
    pipeline = fetch_owned_pipeline(db, pipeline_id, current_user)
    project = fetch_owned_project(db, body.project_id, current_user)

    # Applying a pipeline is a read-modify-write of the working copy, so the read
    # and the write share one exclusive lock; splitting them would let a
    # concurrent transform slip in between and lose an update. The write lock is
    # not reentrant, hence read_project_df rather than load_project_df.
    try:
        with project_write_lock(project.project_id):
            df = read_project_df(project)
            result_df = pipeline_service.apply_pipeline_to_project(db, project, pipeline, df)
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=safe_transformation_error_detail(e)) from e

    response_df, pagination = paginate_dataframe(result_df, page, page_size)
    resp = dataframe_to_response(response_df)
    return {
        "project_id": project.project_id,
        "operation_type": "pipeline",
        **resp,
        **pagination,
    }
