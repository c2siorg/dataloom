import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app import database, models, schemas
from app.api import dependencies
from app.services import replay_service
from app.services.dataset_comparison_service import compare_dataframes
from app.services.file_service import get_original_path
from app.services.project_service import delete_checkpoint, get_checkpoints
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
    row_page: int = Query(1, ge=1),
    cell_page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    match_column: str | None = Query(None),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(dependencies.get_project_or_404),
):
    """Compare the current working dataset with a saved checkpoint.

    The checkpoint dataset is reconstructed from the immutable original file by
    replaying the change log up to the position the checkpoint points at, which
    is the same rule a revert uses.
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

    try:
        checkpoint_df = replay_service.restore_checkpoint_state(
            db,
            project_id,
            get_original_path(project.file_path),
            checkpoint.log_position,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Unable to reconstruct checkpoint dataset") from exc

    current_df = read_table_safe(Path(project.file_path))

    try:
        result = compare_dataframes(
            checkpoint_df,
            current_df,
            row_page=row_page,
            cell_page=cell_page,
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
        row_page=result.row_page,
        cell_page=result.cell_page,
        page_size=result.page_size,
        total_row_pages=result.total_row_pages,
        total_cell_pages=result.total_cell_pages,
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
