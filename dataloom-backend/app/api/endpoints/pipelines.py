"""Pipeline API endpoints: save, list, check, apply, and delete pipelines."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import fetch_owned_project, get_current_user, load_project_df
from app.services import pipeline_service
from app.services.project_service import log_transformation
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, save_table_safe
from app.utils.security import safe_transformation_error_detail

logger = get_logger(__name__)

router = APIRouter()


def _get_owned_pipeline(db: Session, pipeline_id: uuid.UUID, user: models.User) -> models.Pipeline:
    """Fetch a pipeline owned by the user, 404 otherwise (existence-hiding)."""
    pipeline = db.query(models.Pipeline).filter(models.Pipeline.id == pipeline_id).first()
    if pipeline is None or pipeline.owner_id != user.id:
        raise HTTPException(status_code=404, detail=f"Pipeline with ID {pipeline_id} not found")
    return pipeline


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
    pipeline = _get_owned_pipeline(db, pipeline_id, current_user)
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
    return pipeline_service.check_steps_compatibility(df, body.steps)


@router.post("/{pipeline_id}/check", response_model=schemas.PipelineCompatibilityResponse)
def check_pipeline(
    pipeline_id: uuid.UUID,
    body: schemas.PipelineApplyRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Dry-run a pipeline against a project and report the first failing step."""
    pipeline = _get_owned_pipeline(db, pipeline_id, current_user)
    project = fetch_owned_project(db, body.project_id, current_user)
    df = load_project_df(project)
    return pipeline_service.check_pipeline_compatibility(df, pipeline)


@router.post("/{pipeline_id}/apply", response_model=schemas.BasicQueryResponse)
def apply_pipeline(
    pipeline_id: uuid.UUID,
    body: schemas.PipelineApplyRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Replay a pipeline's steps onto a project and log each step."""
    pipeline = _get_owned_pipeline(db, pipeline_id, current_user)
    project = fetch_owned_project(db, body.project_id, current_user)

    df = load_project_df(project)
    try:
        result_df = pipeline_service.apply_pipeline(df, pipeline)
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=safe_transformation_error_detail(e)) from e

    save_table_safe(result_df, project.file_path)
    try:
        for step in sorted(pipeline.steps, key=lambda s: s.step_order):
            log_transformation(db, project.project_id, step.action_type, step.action_details)
    except Exception:
        # Compensate the disk mutation if audit logging fails, so the file never
        # ends up transformed with a missing or partial log — save, undo and
        # checkpoint replay all read back from these entries.
        try:
            save_table_safe(df, project.file_path)
        except Exception:
            logger.exception(
                "Failed to restore project file after log_transformation failure for project_id=%s pipeline_id=%s",
                project.project_id,
                pipeline.id,
            )
        raise

    resp = dataframe_to_response(result_df)
    return {
        "project_id": project.project_id,
        "operation_type": "pipeline",
        **resp,
    }
