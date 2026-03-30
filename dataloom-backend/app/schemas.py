"""Pydantic request/response schemas for all API endpoints."""

import datetime
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, field_validator

# --- Enums ---


class FilterCondition(StrEnum):
    """Supported filter comparison operators."""

    EQ = "="
    NEQ = "!="
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    CONTAINS = "contains"


class OperationType(StrEnum):
    """All supported transformation operation types."""

    filter = "filter"
    sort = "sort"
    addRow = "addRow"
    delRow = "delRow"
    addCol = "addCol"
    delCol = "delCol"
    fillEmpty = "fillEmpty"
    dropDuplicate = "dropDuplicate"
    advQueryFilter = "advQueryFilter"
    pivotTables = "pivotTables"
    changeCellValue = "changeCellValue"
    renameCol = "renameCol"
    castDataType = "castDataType"
    trimWhitespace = "trimWhitespace"
    dropNa = "dropNa"


class DropDup(StrEnum):
    """Options for which duplicate rows to keep."""

    first = "first"
    last = "last"


class AggFunc(StrEnum):
    """Supported aggregation functions for pivot tables."""

    sum = "sum"
    mean = "mean"
    median = "median"
    min = "min"
    max = "max"
    count = "count"


class ActionTypes(StrEnum):
    """Action types for user log entries."""

    filter = "filter"
    sort = "sort"
    addRow = "addRow"
    delRow = "delRow"
    addCol = "addCol"
    delCol = "delCol"
    fillEmpty = "fillEmpty"
    dropDuplicate = "dropDuplicate"
    advQueryFilter = "advQueryFilter"
    pivotTables = "pivotTables"
    changeCellValue = "changeCellValue"
    renameCol = "renameCol"
    castDataType = "castDataType"
    trimWhitespace = "trimWhitespace"
    dropNa = "dropNa"


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


class AddColumn(BaseModel):
    """Parameters for adding a column.

    Attributes:
        index: Zero-based column index where column will be inserted.
        name: Column name; required for add operations.
    """

    index: int
    name: str | None = None


class DeleteColumn(BaseModel):
    """Parameters for deleting a column.

    Attributes:
        index: Zero-based column index to delete.
    """

    index: int


class ChangeCellValue(BaseModel):
    """Parameters for updating a single cell value."""

    col_index: int
    row_index: int
    fill_value: Any


class FillEmptyParams(BaseModel):
    """Parameters for filling empty cells."""

    index: int | None
    fill_value: Any


class RenameColumnParams(BaseModel):
    """Parameters for renaming a column."""

    col_index: int
    new_name: str


class DataType(StrEnum):
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


class TrimWhitespaceParams(BaseModel):
    """Parameters for trimming whitespace from columns."""

    column: str


class DropNaParams(BaseModel):
    """Parameters for dropping rows with missing/NaN values."""

    columns: list[str] | None = None

    @field_validator("columns")
    @classmethod
    def columns_must_not_be_empty(cls, v):
        if v is not None and len(v) == 0:
            raise ValueError("columns list must not be empty; omit the field to drop rows with any NaN")
        return v


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
    add_col_params: AddColumn | None = None
    del_col_params: DeleteColumn | None = None
    fill_empty_params: FillEmptyParams | None = None
    drop_duplicate: DropDuplicates | None = None
    adv_query: AdvQuery | None = None
    pivot_query: Pivot | None = None
    change_cell_value: ChangeCellValue | None = None
    rename_col_params: RenameColumnParams | None = None
    cast_data_type_params: CastDataTypeParams | None = None
    trim_whitespace_params: TrimWhitespaceParams | None = None
    drop_na_params: DropNaParams | None = None


class BasicQueryResponse(BaseModel):
    """Response for transformation operations."""

    project_id: uuid.UUID
    operation_type: str
    row_count: int
    columns: list[str]
    rows: list[list]
    dtypes: dict[str, str] = {}


class ColumnProfile(BaseModel):
    """Per-column statistics returned as part of the upload/profile response.

    All columns include: column name, dtype label, total row count, null
    count, null percentage, and unique value count.

    Numeric columns additionally include: min, max, mean, std, and the
    25th / 50th / 75th percentiles (p25, p50, p75).

    Non-numeric columns additionally include: top_values, a dict mapping
    the five most frequent values to their occurrence counts.
    """

    column: str
    dtype: str
    count: int
    null_count: int
    null_pct: float
    unique_count: int
    # Numeric extras (None for non-numeric columns)
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    std: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    # Categorical extras (None for numeric columns)
    top_values: dict[str, int] | None = None


class ProjectResponse(BaseModel):
    """Response for project CRUD operations."""

    filename: str
    file_path: str
    project_id: uuid.UUID
    columns: list[str]
    row_count: int
    rows: list[list]
    dtypes: dict[str, str] = {}
    profile: list[ColumnProfile] = []


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
