"""Pydantic request/response schemas for all API endpoints."""

import uuid
from pydantic import BaseModel
from enum import Enum
from typing import Optional, Union, Any, List
import datetime


# --- Enums ---

class FilterCondition(str, Enum):
    """Supported filter comparison operators."""
    EQ = '='
    GT = '>'
    LT = '<'
    GTE = '>='
    LTE = '<='


class OperationType(str, Enum):
    """All supported transformation operation types."""
    filter = 'filter'
    sort = 'sort'
    addRow = 'addRow'
    delRow = 'delRow'
    addCol = 'addCol'
    delCol = 'delCol'
    fillEmpty = 'fillEmpty'
    dropDuplicate = 'dropDuplicate'
    advQueryFilter = 'advQueryFilter'
    pivotTables = 'pivotTables'
    changeCellValue = 'changeCellValue'
    renameCol = 'renameCol'
    castDataType = 'castDataType'


class DropDup(str, Enum):
    """Options for which duplicate rows to keep."""
    first = 'first'
    last = 'last'


class AggFunc(str, Enum):
    """Supported aggregation functions for pivot tables."""
    sum = 'sum'
    mean = 'mean'
    median = 'median'
    min = 'min'
    max = 'max'
    count = 'count'


class ActionTypes(str, Enum):
    """Action types for user log entries."""
    filter = 'filter'
    sort = 'sort'
    addRow = 'addRow'
    delRow = 'delRow'
    addCol = 'addCol'
    delCol = 'delCol'
    fillEmpty = 'fillEmpty'
    dropDuplicate = 'dropDuplicate'
    advQueryFilter = 'advQueryFilter'
    pivotTables = 'pivotTables'
    changeCellValue = 'changeCellValue'
    renameCol = 'renameCol'
    castDataType = 'castDataType'


# --- Basic transformation parameter schemas ---

class FilterParameters(BaseModel):
    """Parameters for a column filter operation."""
    column: str
    condition: FilterCondition
    value: str


class SortParameters(BaseModel):
    """Parameters for a column sort operation."""
    column: str
    ascending: bool


class AddOrDeleteRow(BaseModel):
    """Parameters for adding or deleting a row by index."""
    index: int


class AddOrDeleteColumn(BaseModel):
    """Parameters for adding or deleting a column by index and name."""
    index: int
    name: str


class ChangeCellValue(BaseModel):
    """Parameters for updating a single cell value."""
    col_index: int
    row_index: int
    fill_value: Any


class FillEmptyStrategy(str, Enum):
    CUSTOM = "custom"
    MEAN = "mean"
    MEDIAN = "median"
    MODE = "mode"
    FORWARD_FILL = "forward_fill"
    BACKWARD_FILL = "backward_fill"

class FillEmptyParams(BaseModel):
    """Parameters for filling empty cells."""
    index: Optional[int]
    fill_value: Any = None
    strategy: FillEmptyStrategy = FillEmptyStrategy.CUSTOM


class RenameColumnParams(BaseModel):
    """Parameters for renaming a column."""
    col_index: int
    new_name: str


class DataType(str, Enum):
    """Supported target types for data type casting."""
    string = "string"
    integer = "integer"
    float = "float"
    boolean = "boolean"
    datetime = "datetime"


class CastDataTypeParams(BaseModel):
    """Parameters for casting a column to a different data type."""
    column: str
    target_type: DataType


# --- Complex transformation parameter schemas ---

class DropDuplicates(BaseModel):
    """Parameters for dropping duplicate rows."""
    columns: str
    keep: Union[DropDup, bool]


class AdvQuery(BaseModel):
    """Parameters for an advanced pandas query filter."""
    query: str


class Pivot(BaseModel):
    """Parameters for creating a pivot table."""
    index: str
    column: Optional[str] = None
    value: str
    aggfun: AggFunc


class RevertRequest(BaseModel):
    """Request body for reverting to a checkpoint."""
    checkpoint_id: uuid.UUID


# --- User log schemas ---

class UserLogsAction(BaseModel):
    """A user action to log."""
    projectId: uuid.UUID
    actionType: ActionTypes


class UserLogsInput(BaseModel):
    """Input wrapper for user log actions."""
    user_actions: Optional[UserLogsAction] = None


# --- Transformation input/output schemas ---

class TransformationInput(BaseModel):
    """Unified input for all transformation operations."""
    operation_type: OperationType
    parameters: Optional[FilterParameters] = None
    sort_params: Optional[SortParameters] = None
    row_params: Optional[AddOrDeleteRow] = None
    col_params: Optional[AddOrDeleteColumn] = None
    fill_empty_params: Optional[FillEmptyParams] = None
    drop_duplicate: Optional[DropDuplicates] = None
    adv_query: Optional[AdvQuery] = None
    pivot_query: Optional[Pivot] = None
    change_cell_value: Optional[ChangeCellValue] = None
    rename_col_params: Optional[RenameColumnParams] = None
    cast_data_type_params: Optional[CastDataTypeParams] = None


class BasicQueryResponse(BaseModel):
    """Response for transformation operations."""
    project_id: uuid.UUID
    operation_type: str
    row_count: int
    columns: list[str]
    rows: list[list]


class ProjectResponse(BaseModel):
    """Response for project CRUD operations."""
    filename: str
    file_path: str
    project_id: uuid.UUID
    columns: list[str]
    row_count: int
    rows: list[list]


# --- Other response schemas ---

class CheckpointResponse(BaseModel):
    """Response for checkpoint queries."""
    id: uuid.UUID
    message: str
    created_at: datetime.datetime


class LogResponse(BaseModel):
    """Response for change log entries."""
    id: int
    action_type: str
    action_details: dict
    timestamp: datetime.datetime
    checkpoint_id: Optional[uuid.UUID]
    applied: bool


class LastResponse(BaseModel):
    """Response for recently modified projects."""
    project_id: uuid.UUID
    name: str
    description: Optional[str]
    last_modified: datetime.datetime

    class Config:
        from_attributes = True
