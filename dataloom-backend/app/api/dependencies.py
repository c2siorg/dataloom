"""Shared FastAPI dependencies for endpoint functions."""

import uuid

from fastapi import Depends, HTTPException
from sqlmodel import Session, select

from app import database, models
from app.utils.logging import get_logger

logger = get_logger(__name__)


def get_project_or_404(project_id: uuid.UUID, db: Session = Depends(database.get_db)) -> models.Project:
    """FastAPI dependency that fetches a project or raises 404.

    Args:
        project_id: The project primary key from the path.
        db: Injected database session.

    Returns:
        The Project model instance.

    Raises:
        HTTPException: 404 if project not found.
    """
    statement = select(models.Project).where(models.Project.project_id == project_id)
    project = db.exec(statement).first()
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    return project
