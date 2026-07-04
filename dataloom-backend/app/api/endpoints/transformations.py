"""Transformation API endpoints for project operations.

All transformations are handled through a single unified /transform endpoint.
"""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404
from app.services import transformation_service as ts
from app.services.project_service import log_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_table_safe, save_table_safe

logger = get_logger(__name__)

router = APIRouter()

SAFE_TRANSFORMATION_ERROR_DETAIL = "Invalid transformation request"

_SENSITIVE_TOKEN_MARKERS = (
    "traceback",
    "sqlalchemy",
    "psycopg",
    "sqlite",
    "postgres",
    "password",
    "secret",
    "token",
)
_SQL_MARKERS = ("select ", "insert ", "update ", "delete ", "drop ", "alter ", "create table", " from ", " where ")


def _safe_transformation_error_detail(error: Exception) -> str:
    """Return a client-safe 400 detail for domain transformation failures."""
    detail = str(error).strip()
    if not detail:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    lowered = detail.lower()

    if "\n" in detail or "\r" in detail:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    if any(token in lowered for token in _SENSITIVE_TOKEN_MARKERS):
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    # Redact SQL-like payloads only when multiple SQL markers co-occur.
    if sum(marker in lowered for marker in _SQL_MARKERS) >= 2:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    # Redact likely filesystem paths that should not be exposed to clients.
    if re.search(r"[A-Za-z]:\\[^\\\n]+", detail) or re.search(r"/(?:[^/\n]+/)+[^/\n]+", detail):
        return SAFE_TRANSFORMATION_ERROR_DETAIL
    return detail


def _safe_http_exception_detail(error: HTTPException) -> str | None:
    """Return a redacted detail for sensitive HTTPException payloads."""
    detail = error.detail if isinstance(error.detail, str) else ""
    lowered = detail.lower()

    if error.status_code >= 500:
        return "Internal server error"

    # Utility-layer file 404s may embed absolute paths.
    if error.status_code == 404 and "file not found" in lowered:
        return "File not found"

    if detail and (re.search(r"[A-Za-z]:\\[^\\\n]+", detail) or re.search(r"/(?:[^/\n]+/)+[^/\n]+", detail)):
        return "Resource not found" if error.status_code == 404 else "Internal server error"

    return None


def _dispatch_transform(df, transformation_input):
    """Resolve and apply a transformation via the shared registry.

    Validates that the required parameters are present, then calls the registered
    transformation function. The same registry drives the replay path
    (``apply_logged_transformation``), so the two cannot drift apart.

    Returns:
        result_df
    """
    op = transformation_input.operation_type
    spec = ts.TRANSFORMATION_REGISTRY.get(op)
    if spec is None:
        raise HTTPException(status_code=400, detail=f"Unsupported operation: {op}")

    details = transformation_input.dict()
    if spec.params_field is not None and details.get(spec.params_field) is None:
        raise HTTPException(status_code=400, detail=spec.missing_error)

    func = ts.resolve_transformation(spec.func)
    return func(df, *spec.build_args(details))


@router.post("/{project_id}/transform", response_model=schemas.BasicQueryResponse)
def transform_project(
    project_id: uuid.UUID,
    transformation_input: schemas.TransformationInput,
    preview: bool = Query(False, description="If true, return transformation data without saving."),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Apply a transformation to a project.

    Routes to the appropriate internal handler based on operation_type.
    """
    # Keep an explicit local for consistency across dispatch, persistence and
    # logging paths. Use a defensive fallback so exception logging never
    # introduces a secondary NameError.
    operation_type = getattr(transformation_input, "operation_type", "<unknown>")

    try:
        df = read_table_safe(project.file_path)

        result_df = _dispatch_transform(df, transformation_input)

        if not preview:
            save_table_safe(result_df, project.file_path)
            try:
                log_transformation(db, project_id, operation_type, transformation_input.dict())
            except Exception:
                # Compensate disk mutation if audit logging fails to avoid a
                # partially persisted state (file changed without log entry).
                try:
                    save_table_safe(df, project.file_path)
                except Exception:
                    logger.exception(
                        "Failed to restore project file after log_transformation failure for project_id=%s op=%s",
                        project_id,
                        operation_type,
                    )
                raise

        resp = dataframe_to_response(result_df)
        return {
            "project_id": project_id,
            "operation_type": operation_type,
            **resp,
        }
    except HTTPException as e:
        safe_detail = _safe_http_exception_detail(e)
        if safe_detail is None:
            # Preserve explicit HTTP errors (e.g., missing parameters) and their status codes.
            raise

        logger.warning(
            "Redacted HTTPException detail during transform for project_id=%s op=%s status=%s",
            project_id,
            operation_type,
            e.status_code,
        )
        raise HTTPException(status_code=e.status_code, detail=safe_detail) from e
    except ts.TransformationError as e:
        raise HTTPException(status_code=400, detail=_safe_transformation_error_detail(e)) from e
    except Exception as e:
        logger.exception("Unexpected error during transform for project_id=%s op=%s", project_id, operation_type)
        raise HTTPException(status_code=500, detail="Internal server error") from e
