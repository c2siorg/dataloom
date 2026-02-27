"""Transformation API endpoints for project operations.

All transformations are handled through a single unified /transform endpoint.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, schemas
from app.api.dependencies import get_project_or_404
from app.services import transformation_service as ts
from app.services.project_service import log_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe, save_csv_safe

logger = get_logger(__name__)

router = APIRouter()

COMPLEX_OPERATIONS = {'dropDuplicate', 'advQueryFilter', 'pivotTables'}


def _handle_basic_transform(df, transformation_input, project, db, project_id):
    """Apply a basic transformation and optionally persist changes.

    For operations that modify data (addRow, delRow, addCol, delCol, changeCellValue, fillEmpty),
    saves to disk and logs the transformation. For read-only operations (filter, sort),
    only returns the result.

    Returns:
        Tuple of (result_df, should_save).
    """
    op = transformation_input.operation_type

    if op == 'filter':
        if not transformation_input.parameters:
            raise HTTPException(status_code=400, detail="Filter parameters required")
        p = transformation_input.parameters
        return ts.apply_filter(df, p.column, p.condition, p.value), False

    elif op == 'sort':
        if not transformation_input.sort_params:
            raise HTTPException(status_code=400, detail="Sort parameters required")
        p = transformation_input.sort_params
        return ts.apply_sort(df, p.column, p.ascending), False

    elif op == 'addRow':
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.add_row(df, transformation_input.row_params.index), True

    elif op == 'delRow':
        if not transformation_input.row_params:
            raise HTTPException(status_code=400, detail="Row parameters required")
        return ts.delete_row(df, transformation_input.row_params.index), True

    elif op == 'addCol':
        if not transformation_input.col_params or transformation_input.col_params.name is None:
            raise HTTPException(status_code=400, detail="Column index and name required for addCol")
        p = transformation_input.col_params
        return ts.add_column(df, p.index, p.name), True

    elif op == 'delCol':
        if not transformation_input.col_params:
            raise HTTPException(status_code=400, detail="Column index required")
        return ts.delete_column(df, transformation_input.col_params.index), True

    elif op == 'changeCellValue':
        if not transformation_input.change_cell_value:
            raise HTTPException(status_code=400, detail="Cell value parameters required")
        p = transformation_input.change_cell_value
        return ts.change_cell_value(df, p.row_index, p.col_index, p.fill_value), True

    elif op == 'fillEmpty':
        if not transformation_input.fill_empty_params:
            raise HTTPException(status_code=400, detail="Fill parameters required")
        p = transformation_input.fill_empty_params
        return ts.fill_empty(df, p.fill_value, p.index), True

    elif op == 'renameCol':
        if not transformation_input.rename_col_params:
            raise HTTPException(status_code=400, detail="Rename column parameters required")
        p = transformation_input.rename_col_params
        return ts.rename_column(df, p.col_index, p.new_name), True

    elif op == 'castDataType':
        if not transformation_input.cast_data_type_params:
            raise HTTPException(status_code=400, detail="Cast data type parameters required")
        p = transformation_input.cast_data_type_params
        return ts.cast_data_type(df, p.column, p.target_type), True

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported operation: {op}")


def _handle_complex_transform(df, transformation_input, project, db, project_id):
    """Apply a complex transformation.

    Returns:
        Tuple of (result_df, should_save).
    """
    op = transformation_input.operation_type

    if op == 'dropDuplicate':
        if not transformation_input.drop_duplicate:
            raise HTTPException(status_code=400, detail="Drop duplicate parameters required")
        p = transformation_input.drop_duplicate
        return ts.drop_duplicates(df, p.columns, p.keep), True

    elif op == 'advQueryFilter':
        if not transformation_input.adv_query:
            raise HTTPException(status_code=400, detail="Query parameter required")
        return ts.advanced_query(df, transformation_input.adv_query.query), False

    elif op == 'pivotTables':
        if not transformation_input.pivot_query:
            raise HTTPException(status_code=400, detail="Pivot parameters required")
        p = transformation_input.pivot_query
        return ts.pivot_table(df, p.index, p.value, p.column, p.aggfun), False

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
            result_df, should_save = _handle_complex_transform(
                df, transformation_input, project, db, project_id
            )
        else:
            result_df, should_save = _handle_basic_transform(
                df, transformation_input, project, db, project_id
            )
    except ts.TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if should_save:
        save_csv_safe(result_df, project.file_path)
        log_transformation(db, project_id, transformation_input.operation_type, transformation_input.dict())

    resp = dataframe_to_response(result_df)
    return {
        "project_id": project_id,
        "operation_type": transformation_input.operation_type,
        **resp,
    }
