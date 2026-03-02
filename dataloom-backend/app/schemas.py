"""Pydantic request/response schemas for all API endpoints."""

import datetime
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

# --- Enums ---

class FilterCondition(StrEnum):
    """Supported filter comparison operators."""
    EQ = '='
    GT = '>'
    LT = '<'
    GTE = '>='
    LTE = '<='


class OperationType(StrEnum):
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


class DropDup(StrEnum):
    """Options for which duplicate rows to keep."""
    first = 'first'
    last = 'last'


class AggFunc(StrEnum):
    """Supported aggregation functions for pivot tables."""
    sum = 'sum'
    mean = 'mean'
    median = 'median'
    min = 'min'
    max = 'max'
    count = 'count'


class ActionTypes(StrEnum):
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
    index: int | None
    fill_value: Any


# --- Complex transformation parameter schemas ---

class DropDuplicates(BaseModel):
    """Parameters for dropping duplicate rows."""
    columns: str
    keep: DropDup | bool


class AdvQuery(BaseModel):
    """Parameters for an advanced pandas query filter."""
    query: str


class Pivot(BaseModel):
    """Parameters for creating a pivot table."""
    index: str
    column: str | None = None
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
    user_actions: UserLogsAction | None = None


# --- Transformation input/output schemas ---

class TransformationInput(BaseModel):
    """Unified input for all transformation operations."""
    operation_type: OperationType
    parameters: FilterParameters | None = None
    sort_params: SortParameters | None = None
    row_params: AddOrDeleteRow | None = None
    col_params: AddOrDeleteColumn | None = None
    fill_empty_params: FillEmptyParams | None = None
    drop_duplicate: DropDuplicates | None = None
    adv_query: AdvQuery | None = None
    pivot_query: Pivot | None = None
    change_cell_value: ChangeCellValue | None = None


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
    checkpoint_id: uuid.UUID | None
    applied: bool


class LastResponse(BaseModel):
    """Response for recently modified projects."""
    project_id: uuid.UUID
    name: str
    description: str | None
    last_modified: datetime.datetime

    class Config:
        from_attributes = True


# --- Profiling schemas ---


class NumericStatsSchema(BaseModel):
    """Statistics for a numeric column."""
    mean: float | None = None
    median: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None
    q1: float | None = None
    q3: float | None = None
    skewness: float | None = None


class FrequentValueSchema(BaseModel):
    """A value and its occurrence count."""
    value: str
    count: int


class CategoricalStatsSchema(BaseModel):
    """Statistics for a categorical column."""
    top_values: list[FrequentValueSchema] = []
    mode: str | None = None


class ColumnProfileSchema(BaseModel):
    """Profile for a single column."""
    name: str
    dtype: str
    missing_count: int
    missing_percentage: float
    unique_count: int
    numeric_stats: NumericStatsSchema | None = None
    categorical_stats: CategoricalStatsSchema | None = None


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
