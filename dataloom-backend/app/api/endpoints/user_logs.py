import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app import database, models, schemas

router = APIRouter()


@router.get("/{project_id}", response_model=list[schemas.LogResponse])
def get_logs(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    logs = db.exec(
        select(models.ProjectChangeLog)
        .where(models.ProjectChangeLog.project_id == project_id)
        .order_by(models.ProjectChangeLog.timestamp.desc())
    ).all()

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
def get_checkpoints(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    checkpoints = db.exec(
        select(models.Checkpoint)
        .where(models.Checkpoint.project_id == project_id)
        .order_by(models.Checkpoint.created_at.desc())
    ).all()

    return [
        schemas.CheckpointResponse(
            id=checkpoint.id,
            message=checkpoint.message,
            created_at=checkpoint.created_at,
        )
        for checkpoint in checkpoints
    ]
