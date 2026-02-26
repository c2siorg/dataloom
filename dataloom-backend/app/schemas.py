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
    NEQ = '!='
    GT = '>'
    LT = '<'
    GTE = '>='
    LTE = '<='
    CONTAINS = 'contains'


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


class FillEmptyParams(BaseModel):
    """Parameters for filling empty cells."""
    index: Optional[int]
    fill_value: Any


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


# --- Profiling schemas ---


class NumericStatsSchema(BaseModel):
    """Statistics for a numeric column."""
    mean: Optional[float] = None
    median: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    q1: Optional[float] = None
    q3: Optional[float] = None
    skewness: Optional[float] = None


class FrequentValueSchema(BaseModel):
    """A value and its occurrence count."""
    value: str
    count: int


class CategoricalStatsSchema(BaseModel):
    """Statistics for a categorical column."""
    top_values: list[FrequentValueSchema] = []
    mode: Optional[str] = None


class ColumnProfileSchema(BaseModel):
    """Profile for a single column."""
    name: str
    dtype: str
    missing_count: int
    missing_percentage: float
    unique_count: int
    numeric_stats: Optional[NumericStatsSchema] = None
    categorical_stats: Optional[CategoricalStatsSchema] = None


class DatasetSummarySchema(BaseModel):
    """Dataset-level summary metrics."""
    row_count: int
    column_count: int
    missing_count: int
    memory_usage_bytes: int
    duplicate_row_count: int


class ProfileResponse(BaseModel):
    """Full profile response for a project."""
    summary: DatasetSummarySchema
    columns: list[ColumnProfileSchema]
