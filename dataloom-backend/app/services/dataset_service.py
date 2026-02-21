"""Database operations for datasets, logs, and checkpoints."""

from sqlmodel import Session
from app import models
from app.utils.logging import get_logger

logger = get_logger(__name__)


def create_dataset(db: Session, name: str, file_path: str, description: str) -> models.Dataset:
    """Create a new dataset record in the database.

    Args:
        db: Database session.
        name: Project name.
        file_path: Path to the working copy CSV.
        description: Project description.

    Returns:
        The created Dataset model instance.
    """
    dataset = models.Dataset(name=name, file_path=file_path, description=description)
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    logger.info("Created dataset: id=%d, name=%s", dataset.dataset_id, name)
    return dataset


def get_dataset_by_id(db: Session, dataset_id: int) -> models.Dataset | None:
    """Fetch a dataset by its primary key.

    Args:
        db: Database session.
        dataset_id: The dataset primary key.

    Returns:
        The Dataset model instance or None if not found.
    """
    return db.query(models.Dataset).filter(models.Dataset.dataset_id == dataset_id).first()


def get_recent_datasets(db: Session, limit: int = 3) -> list[models.Dataset]:
    """Fetch the most recently modified datasets.

    Args:
        db: Database session.
        limit: Maximum number of datasets to return.

    Returns:
        List of Dataset model instances ordered by last_modified desc.
    """
    return (
        db.query(models.Dataset)
        .order_by(models.Dataset.last_modified.desc())
        .limit(limit)
        .all()
    )


def log_transformation(db: Session, dataset_id: int, operation_type: str, details: dict) -> None:
    """Record a transformation action in the change log.

    Args:
        db: Database session.
        dataset_id: The dataset that was transformed.
        operation_type: The type of operation performed.
        details: Full transformation parameters as a dict.
    """
    log = models.DatasetChangeLog(
        dataset_id=dataset_id,
        action_type=operation_type,
        action_details=details,
    )
    db.add(log)
    db.commit()
    logger.debug("Logged transformation: dataset_id=%d, type=%s", dataset_id, operation_type)


def create_checkpoint(db: Session, dataset_id: int, message: str) -> models.Checkpoint:
    """Create a save checkpoint and mark pending logs as applied.

    Args:
        db: Database session.
        dataset_id: The dataset to checkpoint.
        message: Commit message describing the save point.

    Returns:
        The created Checkpoint model instance.
    """
    checkpoint = models.Checkpoint(dataset_id=dataset_id, message=message)
    db.add(checkpoint)
    db.flush()  # Assigns ID before updating logs

    # Mark all unapplied logs as applied under this checkpoint
    logs = db.query(models.DatasetChangeLog).filter(
        models.DatasetChangeLog.dataset_id == dataset_id,
        models.DatasetChangeLog.applied == False,
    ).all()

    for log in logs:
        log.applied = True
        log.checkpoint_id = checkpoint.id

    db.commit()
    logger.info("Checkpoint created: id=%d, dataset_id=%d, logs_applied=%d", checkpoint.id, dataset_id, len(logs))
    return checkpoint
