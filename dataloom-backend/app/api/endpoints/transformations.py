"""Transformation API endpoints for project operations.

All transformations are handled through a single unified /transform endpoint.
"""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, schemas
from app.api.dependencies import get_project_or_404
from app.services import transformation_service as ts
from app.services.project_service import log_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_file_safe, save_csv_safe

logger = get_logger(__name__)

router = APIRouter()

COMPLEX_OPERATIONS = {"dropDuplicate", "advQueryFilter", "pivotTables", "dropNa", "melt"}
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

    # Utility-layer CSV 404s may embed absolute paths.
    if error.status_code == 404 and "csv file not found" in lowered:
        return "CSV file not found"

    if detail and (re.search(r"[A-Za-z]:\\[^\\\n]+", detail) or re.search(r"/(?:[^/\n]+/)+[^/\n]+", detail)):
        return "Resource not found" if error.status_code == 404 else "Internal server error"

    return None


def _handle_basic_transform(df, transformation_input, project, db, project_id):
    """Apply a basic transformation and optionally persist changes.

    For operations that modify data (addRow, delRow, addCol, delCol, changeCellValue, fillEmpty),
    saves to disk and logs the transformation. For read-only operations (filter, sort),
    only returns the result.

    Returns:
        Tuple of (result_df, should_save).
    """
    op = transformation_input.operation_type

    if op == "filter":
        if not transformation_input.parameters:
            raise HTTPException(status_code=400, detail="Filter parameters required")
        p = transformation_input.parameters
        return ts.apply_filter(df, p.column, p.condition, p.value), False

    elif op == "sort":
        if not transformation_input.sort_params:
            raise HTTPException(status_code=400, detail="Sort parameters required")
        p = transformation_input.sort_params
        return ts.apply_sort(df, p.column, p.ascending), False

    elif op == "addRow":
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.add_row(df, transformation_input.row_params.index), True

    elif op == "delRow":
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.delete_row(df, transformation_input.row_params.index), True

    elif op == "addCol":
        if not transformation_input.add_col_params:
            raise HTTPException(status_code=400, detail="Column parameters required")
        p = transformation_input.add_col_params
        return ts.add_column(df, p.index, p.name), True

    elif op == "delCol":
        if not transformation_input.del_col_params:
            raise HTTPException(status_code=400, detail="Column index required")
        return ts.delete_column(df, transformation_input.del_col_params.index), True

    elif op == "changeCellValue":
        if not transformation_input.change_cell_value:
            raise HTTPException(status_code=400, detail="Cell value parameters required")
        p = transformation_input.change_cell_value
        return ts.change_cell_value(df, p.row_index, p.col_index, p.fill_value), True

    elif op == "fillEmpty":
        if not transformation_input.fill_empty_params:
            raise HTTPException(status_code=400, detail="Fill parameters required")
        p = transformation_input.fill_empty_params
        return ts.fill_empty(df, p.fill_value, p.index), True

    elif op == "renameCol":
        if not transformation_input.rename_col_params:
            raise HTTPException(status_code=400, detail="Rename column parameters required")
        p = transformation_input.rename_col_params
        return ts.rename_column(df, p.col_index, p.new_name), True

    elif op == "castDataType":
        if not transformation_input.cast_data_type_params:
            raise HTTPException(status_code=400, detail="Cast data type parameters required")
        p = transformation_input.cast_data_type_params
        return ts.cast_data_type(df, p.column, p.target_type), True

    elif op == "trimWhitespace":
        if not transformation_input.trim_whitespace_params:
            raise HTTPException(status_code=400, detail="Trim whitespace parameters required")
        p = transformation_input.trim_whitespace_params
        return ts.trim_whitespace(df, p.column), True

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported operation: {op}")


def _handle_complex_transform(df, transformation_input, project, db, project_id):
    """Apply a complex transformation.

    Returns:
        Tuple of (result_df, should_save).
    """
    op = transformation_input.operation_type

    if op == "dropDuplicate":
        if not transformation_input.drop_duplicate:
            raise HTTPException(status_code=400, detail="Drop duplicate parameters required")
        p = transformation_input.drop_duplicate
        return ts.drop_duplicates(df, p.columns, p.keep), True

    elif op == "advQueryFilter":
        if not transformation_input.adv_query:
            raise HTTPException(status_code=400, detail="Query parameter required")
        return ts.advanced_query(df, transformation_input.adv_query.query), False

    elif op == "pivotTables":
        if not transformation_input.pivot_query:
            raise HTTPException(status_code=400, detail="Pivot parameters required")
        p = transformation_input.pivot_query
        return ts.pivot_table(df, p.index, p.value, p.column, p.aggfun), False

    elif op == "dropNa":
        columns = None
        if transformation_input.drop_na_params:
            columns = transformation_input.drop_na_params.columns
        return ts.drop_na(df, columns), True

    elif op == "melt":
        if not transformation_input.melt_params:
            raise HTTPException(status_code=400, detail="Melt parameters required")
        return ts.melt_dataframe(df, transformation_input.melt_params), False

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported operation: {op}")


@router.post("/{project_id}/transform", response_model=schemas.BasicQueryResponse)
async def transform_project(
    project_id: uuid.UUID,
    transformation_input: schemas.TransformationInput,
    db: Session = Depends(database.get_db),
):
    """Apply a transformation to a project.

    Routes to the appropriate internal handler based on operation_type.
    """
    project = get_project_or_404(project_id, db)
    operation_type = getattr(transformation_input, "operation_type", "<unknown>")

    try:
        df = read_file_safe(project.file_path)

        if operation_type in COMPLEX_OPERATIONS:
            result_df, should_save = _handle_complex_transform(df, transformation_input, project, db, project_id)
        else:
            result_df, should_save = _handle_basic_transform(df, transformation_input, project, db, project_id)

        if should_save:
            save_csv_safe(result_df, project.file_path)
            try:
                log_transformation(db, project_id, operation_type, transformation_input.dict())
            except Exception:
                # Compensate disk mutation if audit logging fails to avoid a
                # partially persisted state (file changed without log entry).
                try:
                    save_csv_safe(df, project.file_path)
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
