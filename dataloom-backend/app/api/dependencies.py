"""Shared FastAPI dependencies for endpoint functions."""

from fastapi import Depends, HTTPException
from sqlmodel import Session
from app import database, models
from app.utils.logging import get_logger

logger = get_logger(__name__)


def get_dataset_or_404(dataset_id: int, db: Session = Depends(database.get_db)) -> models.Dataset:
    """FastAPI dependency that fetches a dataset or raises 404.

    Args:
        dataset_id: The dataset primary key from the path.
        db: Injected database session.

    Returns:
        The Dataset model instance.

    Raises:
        HTTPException: 404 if dataset not found.
    """
    dataset = db.query(models.Dataset).filter(
        models.Dataset.dataset_id == dataset_id
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail=f"Dataset with ID {dataset_id} not found")
    return dataset
