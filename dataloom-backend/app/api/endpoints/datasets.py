"""Dataset CRUD API endpoints.

Handles upload, retrieval, save (checkpoint), and revert operations.
"""

from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from sqlmodel import Session
from app import models, schemas, database
from app.api.dependencies import get_dataset_or_404
from app.services.file_service import store_upload, get_original_path
from app.services.dataset_service import (
    create_dataset,
    get_recent_datasets,
    create_checkpoint,
)
from app.services.transformation_service import apply_logged_transformation
from app.utils.pandas_helpers import read_csv_safe, save_csv_safe, dataframe_to_response
from app.utils.security import validate_upload_file
from app.utils.logging import get_logger
from typing import List

logger = get_logger(__name__)

router = APIRouter()


@router.post("/upload", response_model=schemas.DatasetResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    projectName: str = Form(...),
    projectDescription: str = Form(...),
    db: Session = Depends(database.get_db),
):
    """Upload a new CSV dataset file.

    Validates the file, stores it with a sanitized name, creates a working copy,
    and returns the initial dataset data.
    """
    logger.info("Upload request: project=%s, file=%s", projectName, file.filename)
    validate_upload_file(file)

    original_path, copy_path = store_upload(file)
    df = read_csv_safe(original_path)

    dataset = create_dataset(db, projectName, str(copy_path), projectDescription)

    resp = dataframe_to_response(df)
    return {
        "filename": dataset.name,
        "file_path": dataset.file_path,
        "dataset_id": dataset.dataset_id,
        **resp,
    }


@router.get("/get/{dataset_id}", response_model=schemas.DatasetResponse)
async def get_dataset_details(dataset_id: int, db: Session = Depends(database.get_db)):
    """Fetch full dataset details including all rows and columns."""
    dataset = get_dataset_or_404(dataset_id, db)
    df = read_csv_safe(dataset.file_path)

    resp = dataframe_to_response(df)
    return {
        "filename": dataset.name,
        "file_path": dataset.file_path,
        "dataset_id": dataset.dataset_id,
        **resp,
    }


@router.get("/recent", response_model=List[schemas.LastResponse])
def recent_datasets(db: Session = Depends(database.get_db)):
    """Get the 3 most recently modified datasets."""
    datasets = get_recent_datasets(db)
    return [
        schemas.LastResponse(
            dataset_id=d.dataset_id,
            name=d.name,
            description=d.description,
            last_modified=d.last_modified,
        )
        for d in datasets
    ]


@router.post("/{dataset_id}/save", response_model=schemas.DatasetResponse)
async def save_dataset(
    dataset_id: int,
    commit_message: str,
    db: Session = Depends(database.get_db),
):
    """Save dataset changes as a checkpoint.

    Replays all pending transformations from the change log onto the original
    file and creates a checkpoint record marking the save point.
    """
    dataset = get_dataset_or_404(dataset_id, db)

    # Load original dataset for replaying transformations
    original_path = get_original_path(dataset.file_path)
    df = read_csv_safe(original_path)

    # Get all unapplied logs for this dataset
    logs = db.query(models.DatasetChangeLog).filter(
        models.DatasetChangeLog.dataset_id == dataset_id,
        models.DatasetChangeLog.applied == False,
    ).order_by(models.DatasetChangeLog.timestamp).all()

    # Replay each logged transformation on the original
    for log in logs:
        df = apply_logged_transformation(df, log.action_type, log.action_details)

    save_csv_safe(df, original_path)

    # Create checkpoint (marks logs as applied)
    checkpoint = create_checkpoint(db, dataset_id, commit_message)

    resp = dataframe_to_response(df)
    logger.info("Dataset saved: id=%d, checkpoint=%d", dataset_id, checkpoint.id)
    return {
        "filename": dataset.name,
        "file_path": str(original_path),
        "dataset_id": dataset.dataset_id,
        **resp,
    }


@router.post("/{dataset_id}/revert", response_model=schemas.DatasetResponse)
async def revert_to_checkpoint(
    dataset_id: int,
    checkpoint_id: int = None,
    db: Session = Depends(database.get_db),
):
    """Revert dataset to its original state or to a specific checkpoint.

    When checkpoint_id is provided, replays only the logs up to and including
    that checkpoint onto the original file. When None, reverts to the original
    uploaded state.
    """
    dataset = get_dataset_or_404(dataset_id, db)

    original_path = get_original_path(dataset.file_path)
    df = read_csv_safe(original_path)

    if checkpoint_id is not None:
        checkpoint = db.query(models.Checkpoint).filter(
            models.Checkpoint.id == checkpoint_id,
            models.Checkpoint.dataset_id == dataset_id,
        ).first()
        if not checkpoint:
            raise HTTPException(status_code=404, detail="Checkpoint not found")

        logs = db.query(models.DatasetChangeLog).filter(
            models.DatasetChangeLog.dataset_id == dataset_id,
            models.DatasetChangeLog.checkpoint_id <= checkpoint_id,
            models.DatasetChangeLog.applied == True,
        ).order_by(models.DatasetChangeLog.timestamp).all()

        for log in logs:
            df = apply_logged_transformation(df, log.action_type, log.action_details)

    save_csv_safe(df, dataset.file_path)
    db.commit()

    resp = dataframe_to_response(df)
    logger.info("Dataset reverted: id=%d, checkpoint_id=%s", dataset_id, checkpoint_id)
    return {
        "filename": dataset.name,
        "file_path": dataset.file_path,
        "dataset_id": dataset.dataset_id,
        **resp,
    }
