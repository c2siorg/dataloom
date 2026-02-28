"""Pydantic request/response schemas for all API endpoints."""

import datetime
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel

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


class ExportDelimiter(str, Enum):
    """Supported CSV delimiter options for export."""
    comma = "comma"
    tab = "tab"
    semicolon = "semicolon"
    pipe = "pipe"

    def to_char(self) -> str:
        """Return the actual delimiter character."""
        return {"comma": ",", "tab": "\t", "semicolon": ";", "pipe": "|"}[self.value]


class ExportEncoding(str, Enum):
    """Supported file encoding options for export."""
    utf8 = "utf-8"
    latin1 = "latin-1"
    ascii = "ascii"
    utf16 = "utf-16"


class CastDataTypeParams(BaseModel):
    """Parameters for casting a column to a different data type."""

    column: str
    target_type: DataType


class TrimWhitespaceParams(BaseModel):
    """Parameters for trimming whitespace from columns."""

    column: str


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
    rename_col_params: RenameColumnParams | None = None
    cast_data_type_params: CastDataTypeParams | None = None
    trim_whitespace_params: TrimWhitespaceParams | None = None


class BasicQueryResponse(BaseModel):
    """Response for transformation operations."""

    project_id: uuid.UUID
    operation_type: str
    row_count: int
    columns: list[str]
    rows: list[list]
    dtypes: dict[str, str] = {}


class ProjectResponse(BaseModel):
    """Response for project CRUD operations."""

    filename: str
    file_path: str
    project_id: uuid.UUID
    columns: list[str]
    row_count: int
    rows: list[list]
    dtypes: dict[str, str] = {}


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
