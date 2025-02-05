from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import models, schemas, database
from typing import List


router = APIRouter()

@router.get("/{dataset_id}", response_model=List[schemas.LogResponse])
def get_logs(dataset_id: int, db: Session = Depends(database.get_db)):
    logs = db.query(models.DatasetChangeLog).filter(
        models.DatasetChangeLog.dataset_id == dataset_id
    ).order_by(models.DatasetChangeLog.timestamp.desc()).all()
    
    return [schemas.LogResponse(
        id=log.change_log_id,
        action_type=log.action_type,
        action_details=log.action_details,
        timestamp=log.timestamp,
        checkpoint_id=log.checkpoint_id,
        applied=log.applied
    ) for log in logs]

# @router.get("/checkpoints/{dataset_id}", response_model=List[schemas.CheckpointResponse])
# def get_checkpoints(dataset_id: int, db: Session = Depends(database.get_db)):
#     checkpoints = db.query(models.Checkpoint).filter(
#         models.Checkpoint.dataset_id == dataset_id
#     ).order_by(models.Checkpoint.created_at.desc()).all()
    
#     return [schemas.CheckpointResponse(
#         id=checkpoint.id,
#         message=checkpoint.message,
#         created_at=checkpoint.created_at
#     ) for checkpoint in checkpoints]

# ABOVE TO RETURN ALL CHECKPOINTS
@router.get("/checkpoints/{dataset_id}", response_model=schemas.CheckpointResponse)
def get_last_checkpoint(dataset_id: int, db: Session = Depends(database.get_db)):
    # Fetch the last checkpoint for the given dataset_id
    last_checkpoint = db.query(models.Checkpoint).filter(
        models.Checkpoint.dataset_id == dataset_id
    ).order_by(models.Checkpoint.created_at.desc()).first()
    
    if not last_checkpoint:
        raise HTTPException(status_code=404, detail=f"No checkpoints found for dataset ID {dataset_id}")

    # Return the last checkpoint
    return schemas.CheckpointResponse(
        id=last_checkpoint.id,
        message=last_checkpoint.message,
        created_at=last_checkpoint.created_at
    )
