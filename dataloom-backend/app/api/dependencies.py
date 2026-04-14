"""Shared helpers for endpoint functions."""

import uuid

from fastapi import HTTPException
from sqlmodel import Session

from app import models
from app.models import User
from app.services.project_service import get_project_by_id
from app.utils.logging import get_logger

logger = get_logger(__name__)


def get_project_or_404(
    project_id: uuid.UUID,
    db: Session,
    user: User,
) -> models.Project:
    """Fetch a project for the authenticated user or raise 404.

    Args:
        project_id: The project primary key from the path.
        db: Injected database session.
        user: Authenticated user.

    Returns:
        The Project model instance.

    Raises:
        HTTPException: 404 if project not found.
    """
    project = get_project_by_id(db, project_id, owner_id=user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    return project
