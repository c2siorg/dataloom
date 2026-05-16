"""Shared FastAPI dependencies for endpoint functions."""

import uuid

from fastapi import Cookie, Depends, HTTPException
from sqlmodel import Session

from app import database, models
from app.services import auth_service
from app.utils.logging import get_logger

logger = get_logger(__name__)


def get_current_user(
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(database.get_db),
) -> models.User:
    """FastAPI dependency that resolves the authenticated user from the auth cookie.

    Args:
        access_token: The JWT auth token, read from the httpOnly cookie.
        db: Injected database session.

    Returns:
        The authenticated User model instance.

    Raises:
        HTTPException: 401 if the cookie is missing, the token is invalid or
            expired, or the user no longer exists.
    """
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = auth_service.decode_access_token(access_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = auth_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_project_or_404(
    project_id: uuid.UUID,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
) -> models.Project:
    """FastAPI dependency that fetches a project owned by the current user.

    Returns 404 (rather than 403) when the project belongs to another user, so
    the existence of other users' projects is not revealed.

    Args:
        project_id: The project primary key from the path.
        current_user: The authenticated user.
        db: Injected database session.

    Returns:
        The Project model instance.

    Raises:
        HTTPException: 404 if the project does not exist or is not owned by the
            current user.
    """
    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()
    if project is None or project.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    return project
