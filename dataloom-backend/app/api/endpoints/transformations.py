"""Transformation API endpoints for project operations.

All transformations are handled through a single unified /transform endpoint.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404
from app.services import transformation_service as ts
from app.services.file_service import get_original_path
from app.services.project_service import log_transformation, undo_last_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe, save_csv_safe

logger = get_logger(__name__)

router = APIRouter()

COMPLEX_OPERATIONS = {"dropDuplicate", "advQueryFilter", "pivotTables"}


def _handle_basic_transform(df, transformation_input, project, db, project_id):
    """Apply a basic transformation and optionally persist changes.

    For operations that modify data (filter, sort, addRow, delRow, addCol, delCol,
    changeCellValue, fillEmpty, renameCol, castDataType), saves to disk and logs
    the transformation so they can be undone.

    Returns:
        Tuple of (result_df, should_save).
    """
    op = transformation_input.operation_type

    if op == "filter":
        if not transformation_input.parameters:
            raise HTTPException(status_code=400, detail="Filter parameters required")
        p = transformation_input.parameters
        return ts.apply_filter(df, p.column, p.condition, p.value), True

    elif op == "sort":
        if not transformation_input.sort_params:
            raise HTTPException(status_code=400, detail="Sort parameters required")
        p = transformation_input.sort_params
        return ts.apply_sort(df, p.column, p.ascending), True

    elif op == "addRow":
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.add_row(df, transformation_input.row_params.index), True

    elif op == "delRow":
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.delete_row(df, transformation_input.row_params.index), True

    elif op == "addCol":
        if not transformation_input.col_params:
            raise HTTPException(status_code=400, detail="Column parameters required")
        p = transformation_input.col_params
        return ts.add_column(df, p.index, p.name), True

    elif op == "delCol":
        if not transformation_input.col_params:
            raise HTTPException(status_code=400, detail="Column index required")
        return ts.delete_column(df, transformation_input.col_params.index), True

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
        return ts.advanced_query(df, transformation_input.adv_query.query), True

    elif op == "pivotTables":
        if not transformation_input.pivot_query:
            raise HTTPException(status_code=400, detail="Pivot parameters required")
        p = transformation_input.pivot_query
        return ts.pivot_table(df, p.index, p.value, p.column, p.aggfun), True

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
    df = read_csv_safe(project.file_path)

    op = transformation_input.operation_type

    try:
        if op in COMPLEX_OPERATIONS:
            result_df, should_save = _handle_complex_transform(df, transformation_input, project, db, project_id)
        else:
            result_df, should_save = _handle_basic_transform(df, transformation_input, project, db, project_id)
    except ts.TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    if should_save:
        save_csv_safe(result_df, project.file_path)
        log_transformation(db, project_id, transformation_input.operation_type, transformation_input.dict())

    resp = dataframe_to_response(result_df)
    return {
        "project_id": project_id,
        "operation_type": transformation_input.operation_type,
        **resp,
    }


@router.post("/{project_id}/undo", response_model=schemas.ProjectResponse)
async def undo_transformation(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Undo the most recent transformation by removing the last log entry and replaying remaining logs.

    This endpoint removes the most recent unapplied transformation log entry,
    then rebuilds the working copy from the original file by replaying all
    remaining unapplied transformations.

    Returns:
        ProjectResponse with updated columns and rows after undo.

    Raises:
        HTTPException: 400 if there are no transformations to undo.
    """
    project = get_project_or_404(project_id, db)

    # Attempt to undo the last transformation
    deleted_log, remaining_count = undo_last_transformation(db, project_id)

    if deleted_log is None:
        raise HTTPException(status_code=400, detail="No transformations to undo")

    # Load original file for replaying remaining transformations
    original_path = get_original_path(project.file_path)
    df = read_csv_safe(original_path)

    # Get all remaining unapplied logs for this project
    logs = db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.applied == False,
    ).order_by(models.ProjectChangeLog.timestamp).all()

    # Replay each remaining logged transformation on the original
    for log in logs:
        df = ts.apply_logged_transformation(df, log.action_type, log.action_details)

    # Save the rebuilt working copy
    save_csv_safe(df, project.file_path)

    resp = dataframe_to_response(df)
    logger.info("Undo completed: project_id=%s, undone_operation=%s, remaining_logs=%d",
                project_id, deleted_log.action_type, remaining_count)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
    }
