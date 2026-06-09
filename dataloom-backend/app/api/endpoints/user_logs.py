import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import database, models, schemas
from app.api import dependencies
from app.services.project_service import get_checkpoints

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
