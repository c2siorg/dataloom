import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, models, schemas

router = APIRouter()

@router.get("/{project_id}", response_model=list[schemas.LogResponse])
def get_logs(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    logs = db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id
    ).order_by(models.ProjectChangeLog.timestamp.desc()).all()

    return [schemas.LogResponse(
        id=log.change_log_id,
        action_type=log.action_type,
        action_details=log.action_details,
        timestamp=log.timestamp,
        checkpoint_id=log.checkpoint_id,
        applied=log.applied
    ) for log in logs]

@router.get("/checkpoints/{project_id}", response_model=schemas.CheckpointResponse)
def get_last_checkpoint(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    last_checkpoint = db.query(models.Checkpoint).filter(
        models.Checkpoint.project_id == project_id
    ).order_by(models.Checkpoint.created_at.desc()).first()

    if not last_checkpoint:
        raise HTTPException(status_code=404, detail=f"No checkpoints found for project ID {project_id}")

    return schemas.CheckpointResponse(
        id=last_checkpoint.id,
        message=last_checkpoint.message,
        created_at=last_checkpoint.created_at
    )
