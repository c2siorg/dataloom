"""Database operations for projects, logs, and checkpoints."""

import uuid

from sqlmodel import Session

from app import models
from app.utils.logging import get_logger

logger = get_logger(__name__)


def create_project(db: Session, name: str, file_path: str, description: str) -> models.Project:
    """Create a new project record in the database.

    Args:
        db: Database session.
        name: Project name.
        file_path: Path to the working copy CSV.
        description: Project description.

    Returns:
        The created Project model instance.
    """
    project = models.Project(name=name, file_path=file_path, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("Created project: id=%s, name=%s", project.project_id, name)
    return project


def get_project_by_id(db: Session, project_id: uuid.UUID) -> models.Project | None:
    """Fetch a project by its primary key.

    Args:
        db: Database session.
        project_id: The project primary key.

    Returns:
        The Project model instance or None if not found.
    """
    return db.query(models.Project).filter(models.Project.project_id == project_id).first()


def get_recent_projects(db: Session, limit: int = 3) -> list[models.Project]:
    """Fetch the most recently modified projects.

    Args:
        db: Database session.
        limit: Maximum number of projects to return.

    Returns:
        List of Project model instances ordered by last_modified desc.
    """
    return db.query(models.Project).order_by(models.Project.last_modified.desc()).limit(limit).all()


def delete_project(db: Session, project: models.Project) -> None:
    """Delete a project record from the database.

    Cascade rules on the model handle deleting associated logs and checkpoints.

    Args:
        db: Database session.
        project: The Project model instance to delete.
    """
    db.delete(project)
    db.commit()
    logger.info("Deleted project: id=%s, name=%s", project.project_id, project.name)


def log_transformation(db: Session, project_id: uuid.UUID, operation_type: str, details: dict) -> None:
    """Record a transformation action in the change log.

    Args:
        db: Database session.
        project_id: The project that was transformed.
        operation_type: The type of operation performed.
        details: Full transformation parameters as a dict.
    """
    log = models.ProjectChangeLog(
        project_id=project_id,
        action_type=operation_type,
        action_details=details,
    )
    db.add(log)
    db.commit()
    logger.debug("Logged transformation: project_id=%s, type=%s", project_id, operation_type)


def create_checkpoint(db: Session, project_id: uuid.UUID, message: str) -> models.Checkpoint:
    """Create a save checkpoint and mark pending logs as applied.

    Args:
        db: Database session.
        project_id: The project to checkpoint.
        message: Commit message describing the save point.

    Returns:
        The created Checkpoint model instance.
    """
    checkpoint = models.Checkpoint(project_id=project_id, message=message)
    db.add(checkpoint)
    db.flush()  # Assigns ID before updating logs

    # Mark all unapplied logs as applied under this checkpoint
    logs = (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied == False,  # noqa: E712
        )
        .all()
    )

    for log in logs:
        log.applied = True
        log.checkpoint_id = checkpoint.id

    db.commit()
    logger.info("Checkpoint created: id=%s, project_id=%s, logs_applied=%d", checkpoint.id, project_id, len(logs))
    return checkpoint
