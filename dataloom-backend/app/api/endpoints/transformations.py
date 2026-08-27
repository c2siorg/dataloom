"""Transformation API endpoints for project operations.

All transformations are handled through a single unified /transform endpoint.
"""

import math
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404
from app.services import transformation_service as ts
from app.services.project_service import log_transformations_or_restore
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_table_safe, save_table_safe
from app.utils.project_locks import project_read_lock, project_write_lock
from app.utils.security import safe_transformation_error_detail

logger = get_logger(__name__)

router = APIRouter()


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
    page: int = Query(1, ge=1, description="Preview page number."),
    page_size: int = Query(50, ge=1, le=100, description="Rows per preview page."),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Apply a transformation to a project.

    Routes to the appropriate internal handler based on operation_type.

    A preview only reads ``project.file_path``, so it takes the shared read lock
    and stays concurrent with other previews; a real transform rewrites the file
    and needs the exclusive write lock.
    """
    lock = project_read_lock if preview else project_write_lock
    with lock(project_id):
        return _transform_project(project_id, transformation_input, preview, page, page_size, db, project)


def _transform_project(
    project_id: uuid.UUID,
    transformation_input: schemas.TransformationInput,
    preview: bool,
    page: int,
    page_size: int,
    db: Session,
    project: models.Project,
) -> dict:
    operation_type = getattr(transformation_input, "operation_type", "<unknown>")

    try:
        df = read_table_safe(project.file_path)

        result_df = _dispatch_transform(df, transformation_input)

        # A cell edit that produces the same DataFrame is a no-op. Return the current
        # data without rewriting the file or creating a transformation log.
        is_noop_cell_edit = (
            transformation_input.operation_type == schemas.OperationType.changeCellValue and result_df.equals(df)
        )

        if not preview and not is_noop_cell_edit:
            save_table_safe(result_df, project.file_path)
            log_transformations_or_restore(
                db,
                project_id,
                project.file_path,
                df,
                [(operation_type, transformation_input.dict())],
            )

        response_df = result_df
        pagination = {}

        if preview:
            total_rows = len(result_df)
            total_pages = max(1, math.ceil(total_rows / page_size))
            effective_page = min(page, total_pages)

            start = (effective_page - 1) * page_size
            end = start + page_size
            response_df = result_df.iloc[start:end]

            pagination = {
                "total_rows": total_rows,
                "total_pages": total_pages,
                "page": effective_page,
                "page_size": page_size,
            }

        resp = dataframe_to_response(response_df)

        return {
            "project_id": project_id,
            "operation_type": operation_type,
            **resp,
            **pagination,
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
        raise HTTPException(status_code=400, detail=safe_transformation_error_detail(e)) from e
    except Exception as e:
        logger.exception("Unexpected error during transform for project_id=%s op=%s", project_id, operation_type)
        raise HTTPException(status_code=500, detail="Internal server error") from e
