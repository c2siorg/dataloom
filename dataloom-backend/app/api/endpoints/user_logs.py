import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app import database, models, schemas
from app.api import dependencies
from app.services.dataset_comparison_service import compare_dataframes
from app.services.file_service import get_original_path
from app.services.project_service import delete_checkpoint, get_checkpoints
from app.services.transformation_service import apply_logged_transformation
from app.utils.pandas_helpers import read_table_safe

router = APIRouter()


@router.get("/{project_id}", response_model=list[schemas.LogResponse])
def get_logs(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    _project: models.Project = Depends(dependencies.get_project_or_404),
):
    logs = (
        db.query(models.ProjectChangeLog)
        .filter(models.ProjectChangeLog.project_id == project_id)
        .order_by(models.ProjectChangeLog.timestamp.desc())
        .all()
    )

    return [
        schemas.LogResponse(
            id=log.change_log_id,
            action_type=log.action_type,
            action_details=log.action_details,
            timestamp=log.timestamp,
            checkpoint_id=log.checkpoint_id,
            applied=log.applied,
        )
        for log in logs
    ]


@router.get("/checkpoints/{project_id}", response_model=list[schemas.CheckpointResponse])
def get_project_checkpoints(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    _project: models.Project = Depends(dependencies.get_project_or_404),
):
    """Fetch all checkpoints for a project ordered by creation time."""
    return get_checkpoints(db, project_id)


@router.get(
    "/checkpoints/{project_id}/{checkpoint_id}/compare",
    response_model=schemas.DatasetComparisonResponse,
)
def compare_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    match_column: str | None = Query(None),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(dependencies.get_project_or_404),
):
    """Compare the current working dataset with a saved checkpoint.

    The checkpoint dataset is reconstructed from the immutable original file
    by replaying all transformations assigned to checkpoints up to and
    including the selected checkpoint.
    """
    checkpoint = (
        db.query(models.Checkpoint)
        .filter(
            models.Checkpoint.id == checkpoint_id,
            models.Checkpoint.project_id == project_id,
        )
        .first()
    )

    if checkpoint is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    checkpoints = (
        db.query(models.Checkpoint)
        .filter(models.Checkpoint.project_id == project_id)
        .order_by(models.Checkpoint.created_at.asc())
        .all()
    )

    checkpoint_index = next(
        (index for index, item in enumerate(checkpoints) if item.id == checkpoint_id),
        None,
    )

    if checkpoint_index is None:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    checkpoint_ids = {item.id for item in checkpoints[: checkpoint_index + 1]}

    logs = (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.checkpoint_id.in_(checkpoint_ids),
        )
        .order_by(models.ProjectChangeLog.change_log_id.asc())
        .all()
    )

    original_path = get_original_path(project.file_path)

    checkpoint_df = read_table_safe(original_path)

    for log in logs:
        checkpoint_df = apply_logged_transformation(
            checkpoint_df,
            log.action_type,
            log.action_details,
        )

    current_df = read_table_safe(Path(project.file_path))

    try:
        result = compare_dataframes(
            checkpoint_df,
            current_df,
            page=page,
            page_size=page_size,
            match_column=match_column,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return schemas.DatasetComparisonResponse(
        summary=result.summary,
        columns=result.columns,
        rows=result.rows,
        cells=result.cells,
        total_rows=result.total_rows,
        total_cells=result.total_cells,
        page=result.page,
        page_size=result.page_size,
        total_pages=result.total_pages,
        matching_strategy=result.matching_strategy,
    )


@router.delete("/checkpoints/{project_id}/{checkpoint_id}")
def delete_project_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    _project: models.Project = Depends(dependencies.get_project_or_404),
):
    """Delete a checkpoint and unlink its associated logs."""
    delete_checkpoint(db, checkpoint_id, project_id)
    db.commit()
    return {"success": True, "message": "Checkpoint deleted"}
