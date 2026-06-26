"""Database operations for projects, logs, and checkpoints."""

import uuid
from datetime import UTC, datetime

import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app import models
from app.utils.logging import get_logger

logger = get_logger(__name__)


def create_project(
    db: Session,
    name: str,
    file_path: str,
    description: str,
    owner_id: uuid.UUID,
) -> models.Project:
    """Create a new project record in the database.

    Args:
        db: Database session.
        name: Project name.
        file_path: Path to the working copy CSV.
        description: Project description.
        owner_id: User that owns the project.

    Returns:
        The created Project model instance.
    """
    project = models.Project(owner_id=owner_id, name=name, file_path=file_path, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("Created project: id=%s, name=%s", project.project_id, name)
    return project


def get_recent_projects(db: Session, owner_id: uuid.UUID, limit: int = 3) -> list[models.Project]:
    """Fetch a user's most recently modified projects.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        limit: Maximum number of projects to return.

    Returns:
        List of Project model instances ordered by last_modified desc.
    """
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == owner_id)
        .order_by(models.Project.last_modified.desc())
        .limit(limit)
        .all()
    )


def delete_project(db: Session, project: models.Project) -> None:
    """Delete a project record from the database.

    Associated logs are deleted before checkpoints because applied logs can
    reference checkpoints directly.

    Args:
        db: Database session.
        project: The Project model instance to delete.
    """
    project_id = project.project_id
    project_name = project.name

    try:
        deleted_logs = (
            db.query(models.ProjectChangeLog)
            .filter(models.ProjectChangeLog.project_id == project_id)
            .delete(synchronize_session=False)
        )
        deleted_checkpoints = (
            db.query(models.Checkpoint)
            .filter(models.Checkpoint.project_id == project_id)
            .delete(synchronize_session=False)
        )
        deleted_projects = (
            db.query(models.Project).filter(models.Project.project_id == project_id).delete(synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to delete project database records: id=%s, name=%s", project_id, project_name)
        raise

    if deleted_projects == 0:
        logger.warning("Project delete matched no project row: id=%s, name=%s", project_id, project_name)

    logger.info(
        "Deleted project: id=%s, name=%s, projects=%d, logs=%d, checkpoints=%d",
        project_id,
        project_name,
        deleted_projects,
        deleted_logs,
        deleted_checkpoints,
    )


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
    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()
    if project:
        project.last_modified = datetime.now(UTC)
        db.add(project)
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

    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()

    if project:
        project.last_modified = datetime.now(UTC)

    db.commit()
    logger.info(
        "Checkpoint created: id=%s, project_id=%s, logs_applied=%d",
        checkpoint.id,
        project_id,
        len(logs),
    )
    return checkpoint


def get_checkpoints(db: Session, project_id: uuid.UUID) -> list[models.Checkpoint]:
    """Fetch all checkpoints for a project ordered by creation time descending.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        List of Checkpoint model instances ordered by created_at desc.
    """
    return (
        db.query(models.Checkpoint)
        .filter(models.Checkpoint.project_id == project_id)
        .order_by(models.Checkpoint.created_at.desc())
        .all()
    )


def get_last_change_log(db: Session, project_id: uuid.UUID) -> models.ProjectChangeLog | None:
    """Get the most recent change log entry for a project.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        The most recent ProjectChangeLog entry, or None if no logs exist.
    """
    return (
        db.query(models.ProjectChangeLog)
        .filter(models.ProjectChangeLog.project_id == project_id)
        .order_by(models.ProjectChangeLog.change_log_id.desc())
        .first()
    )


def delete_change_log(db: Session, log: models.ProjectChangeLog) -> None:
    """Delete a single change log entry.

    Args:
        db: Database session.
        log: The ProjectChangeLog entry to delete.
    """
    db.delete(log)
    db.flush()
    logger.debug("Deleted change log: id=%s, project_id=%s", log.change_log_id, log.project_id)


def delete_checkpoint(db: Session, checkpoint_id: uuid.UUID, project_id: uuid.UUID) -> None:
    """Delete a checkpoint and unlink its associated logs.

    Logs that referenced this checkpoint are not deleted — they are unlinked
    (checkpoint_id set to None) so the transformation history is preserved.

    Args:
        db: Database session.
        checkpoint_id: The checkpoint to delete.
        project_id: The project the checkpoint belongs to.

    Raises:
        HTTPException: If the checkpoint is not found.
    """

    checkpoint = (
        db.query(models.Checkpoint)
        .filter(
            models.Checkpoint.id == checkpoint_id,
            models.Checkpoint.project_id == project_id,
        )
        .first()
    )

    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    # Unlink logs referencing this checkpoint
    db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.checkpoint_id == checkpoint_id).update(
        {"checkpoint_id": None}, synchronize_session="evaluate"
    )

    db.delete(checkpoint)
    db.flush()
    logger.info("Deleted checkpoint: id=%s, project_id=%s", checkpoint_id, project_id)


def _normalize_project_name(name: str) -> str:
    """Trim whitespace from a project name and ensure it is not empty.

    Args:
        name: The project name to normalize.

    Returns:
        The normalized project name.

    Raises:
        ValueError: If the project name is empty or whitespace-only.
    """
    trimmed_name = name.strip()
    if not trimmed_name:
        raise ValueError("Project name cannot be empty")
    return trimmed_name


def rename_project(db: Session, project: models.Project, new_name: str) -> models.Project:
    """Rename a project.

    Args:
        db: Database session.
        project: The project to rename.
        new_name: The new project name (must be non-empty after trimming).

    Returns:
        The updated Project model instance.

    Raises:
        ValueError: If new_name is empty or whitespace-only.
    """
    trimmed_name = _normalize_project_name(new_name)

    project.name = trimmed_name
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("Renamed project: id=%s, new_name=%s", project.project_id, trimmed_name)
    return project


def search_projects(db: Session, owner_id: uuid.UUID, query: str, limit: int = 20) -> list[models.Project]:
    """Search a user's projects by name or description, case-insensitive.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        query: Search string to match against name/description.
        limit: Maximum number of results to return.

    Returns:
        List of matching Project model instances ordered by last_modified desc.
    """
    pattern = f"%{query}%"
    return (
        db.query(models.Project)
        .filter(
            models.Project.owner_id == owner_id,
            sa.or_(
                models.Project.name.ilike(pattern),
                models.Project.description.ilike(pattern),
            ),
        )
        .order_by(models.Project.last_modified.desc())
        .limit(limit)
        .all()
    )


def update_project(
    db: Session,
    project: models.Project,
    name: str | None,
    description: str | None,
) -> models.Project:
    """Update a project's name and/or description.

    Args:
        db: Database session.
        project: The project to update.
        name: The new project name. If provided, it is trimmed and must not be empty.
        description: The new project description. If provided, it is trimmed before being saved.

    Returns:
        The updated Project model instance.

    Raises:
        ValueError: If ``name`` is provided but is empty after trimming.
    """
    if name is not None:
        trimmed = _normalize_project_name(name)
        project.name = trimmed

    if description is not None:
        project.description = description.strip()

    db.add(project)
    db.commit()
    db.refresh(project)

    logger.info("Updated project: id=%s", project.project_id)
    return project


def get_projects(
    db: Session,
    owner_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[models.Project]:
    """Fetch a user's projects with pagination.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        limit: Maximum number of projects to return.
        offset: Number of projects to skip.

    Returns:
        List of Project model instances ordered by last_modified desc.
    """
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == owner_id)
        .order_by(models.Project.last_modified.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
