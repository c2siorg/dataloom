"""Shared FastAPI dependencies for endpoint functions."""

import math
import threading
import uuid

import pandas as pd
from fastapi import Cookie, Depends, HTTPException, Request
from sqlmodel import Session

from app import database, models
from app.config import get_settings
from app.services import auth_service
from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_table_safe
from app.utils.rate_limiter import RateLimiter

logger = get_logger(__name__)

_limiter: RateLimiter | None = None
_limiter_lock = threading.Lock()


def rate_limit(
    request: Request,
) -> None:
    """FastAPI dependency that rate-limits requests by the direct TCP client IP.

    The client IP is always taken from ``request.client.host`` (the direct TCP
    connection) and never from client-supplied headers.  Operators behind a
    reverse proxy must strip or overwrite the peer IP at the proxy layer.

    Returns 429 with a ``Retry-After`` header when the limit is exceeded.
    """
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return

    global _limiter
    if _limiter is None:
        with _limiter_lock:
            if _limiter is None:
                _limiter = RateLimiter(
                    settings.rate_limit_max_requests,
                    settings.rate_limit_window_seconds,
                )

    client_ip = request.client.host if request.client is not None else "unknown"
    allowed, retry_after = _limiter.check(client_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Try again in {math.ceil(retry_after)} seconds.",
            headers={"Retry-After": str(math.ceil(retry_after))},
        )


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


def load_project_df(project: models.Project) -> pd.DataFrame:
    """Read a project's working copy, redacting any path from error details.

    ``read_table_safe`` embeds the absolute file path in its 404/500 details;
    surface a generic message to the client instead, matching the transform
    endpoint's handling. Shared by the profiling and visualization endpoints.
    """
    try:
        return read_table_safe(project.file_path)
    except HTTPException as e:
        if e.status_code == 404:
            raise HTTPException(status_code=404, detail="Project data file not found") from e
        logger.warning("Failed to read project file project_id=%s status=%s", project.project_id, e.status_code)
        raise HTTPException(status_code=e.status_code, detail="Could not read project data") from e
