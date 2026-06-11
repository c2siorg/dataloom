"""Pydantic request/response schemas for all API endpoints."""

import datetime
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

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
    groupby = "groupby"
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
    melt = "melt"
    sample = "sample"
    stringReplace = "stringReplace"


class DropDup(StrEnum):
    """Options for which duplicate rows to keep."""

    first = "first"
    last = "last"


class FillStrategy(StrEnum):
    """Supported strategies for filling empty cells."""

    custom = "custom"
    mean = "mean"
    median = "median"
    mode = "mode"
    ffill = "ffill"
    bfill = "bfill"


class AggFunc(StrEnum):
    """Supported aggregation functions for pivot tables."""

    sum = "sum"
    mean = "mean"
    median = "median"
    min = "min"
    max = "max"
    count = "count"


# --- Basic transformation parameter schemas ---


class FilterParameters(BaseModel):
    """Parameters for a column filter operation."""

    column: str
    condition: FilterCondition
    value: str


class SortCriterion(BaseModel):
    """A single sort criterion (column + direction)."""

    column: str
    ascending: bool


class SortParameters(BaseModel):
    """Parameters for a column sort operation.

    Supports both single-column (backward compatible) and multi-column sorting.
    For multi-column sorting, use 'criteria' with a list of SortCriterion objects.
    """

    column: str | None = None
    ascending: bool = True
    criteria: list[SortCriterion] | None = None


class AddOrDeleteRow(BaseModel):
    """Parameters for adding or deleting a row by index."""

    index: int


class AddColumn(BaseModel):
    """Parameters for adding a column.

    Attributes:
        index: Zero-based column index where column will be inserted.
        name: Column name (required, non-blank).
    """

    index: int
    name: str

    @field_validator("name")
    @classmethod
    def name_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Column name cannot be empty or whitespace")
        return v


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
    fill_value: Any | None = None
    strategy: FillStrategy = FillStrategy.custom


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


class StringReplaceParams(BaseModel):
    """Parameters for find-and-replace on a string column."""

    column: str
    find_value: str
    replace_value: str

    @field_validator("find_value")
    @classmethod
    def find_value_must_not_be_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("find_value must not be empty")
        return v


# --- Complex transformation parameter schemas ---


class DropDuplicates(BaseModel):
    """Parameters for dropping duplicate rows."""

    columns: str
    keep: DropDup | bool


class AdvQuery(BaseModel):
    """Parameters for an advanced pandas query filter."""

    query: str


class GroupByParams(BaseModel):
    """Parameters for groupby aggregation."""

    columns: list[str]
    agg_column: str
    agg_function: AggFunc


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
    actionType: OperationType


class UserLogsInput(BaseModel):
    """Input wrapper for user log actions."""

    user_actions: UserLogsAction | None = None


# --- Melt transformation parameter schema ---


class MeltParams(BaseModel):
    """Parameters for the Melt (Unpivot) transformation."""

    id_vars: list[str]
    value_vars: list[str] | None = None
    var_name: str = "variable"
    value_name: str = "value"


# --- Transformation input/output schemas ---
class SampleParams(BaseModel):
    """Parameters for sampling rows from a dataset."""

    sample_size: int = Field(gt=0, description="Number of rows to sample; must be positive")
    random_seed: int | None = Field(default=None, ge=0, le=4294967295, description="Optional seed for reproducibility")


class TransformationInput(BaseModel):
    """Unified input for all transformation operations."""

    groupby_params: GroupByParams | None = None
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
    melt_params: MeltParams | None = None
    sample_params: SampleParams | None = None
    string_replace_params: StringReplaceParams | None = None


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
    page: int
    total_rows: int
    total_pages: int
    page_size: int
    columns: list[str]
    row_count: int
    rows: list[list]
    dtypes: dict[str, str] = {}


# --- Profiling response schemas ---
#
# Descriptive profiling only (dataset/column/correlation). All ``*_percentage``
# fields are 0–100. Type-specific column fields are optional: a numeric column
# fills the numeric block and leaves the categorical/datetime blocks null, etc.


class DatasetSummaryResponse(BaseModel):
    """Top-level overview of a dataset."""

    row_count: int
    column_count: int
    total_missing_cells: int
    missing_cell_percentage: float
    duplicate_row_count: int
    memory_usage_bytes: int
    dtype_counts: dict[str, int]
    numeric_columns: list[str]
    categorical_columns: list[str]
    boolean_columns: list[str]
    datetime_columns: list[str]


class TopValue(BaseModel):
    """A single value/count/percentage entry in a categorical column profile."""

    value: str
    count: int
    percentage: float


class ColumnProfileResponse(BaseModel):
    """Type-aware profile of a single column."""

    column: str
    dtype: str
    row_count: int
    null_count: int
    null_percentage: float
    unique_count: int
    unique_percentage: float
    distribution: str

    # Numeric block
    mean: float | None = None
    median: float | None = None
    min: float | None = None
    max: float | None = None
    std: float | None = None
    q1: float | None = None
    q3: float | None = None
    skew: float | None = None
    zero_count: int | None = None
    negative_count: int | None = None

    # Categorical block
    top_values: list[TopValue] | None = None
    cardinality: int | None = None
    dominant_value_percentage: float | None = None
    rare_value_count: int | None = None

    # Boolean block
    true_count: int | None = None
    false_count: int | None = None
    true_percentage: float | None = None

    # Datetime block
    min_date: str | None = None
    max_date: str | None = None
    range_days: int | None = None
    inferred_granularity: str | None = None


class CorrelationResponse(BaseModel):
    """Pairwise Pearson correlation over numeric columns."""

    columns: list[str]
    matrix: list[list[float | None]]


# --- Other response schemas ---


class CheckpointResponse(BaseModel):
    """Response for checkpoint queries."""

    id: uuid.UUID
    message: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


# --- Auth schemas ---


class SignupRequest(BaseModel):
    """Request body for user signup."""

    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_length_ok(cls, v: str) -> str:
        byte_len = len(v.encode("utf-8"))
        if byte_len < 8:
            raise ValueError("password must be at least 8 characters")
        if byte_len > 72:
            raise ValueError("password must be at most 72 bytes")
        return v


class SigninRequest(BaseModel):
    """Request body for user signin."""

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class UserResponse(BaseModel):
    """Public representation of a user; never exposes the password hash."""

    id: uuid.UUID
    email: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class ForgotPasswordRequest(BaseModel):
    """Request body for password reset email."""

    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Request body for resetting password with token."""

    token: str
    new_password: str


class UpdateEmailRequest(BaseModel):
    """Request body for updating the authenticated user's email."""

    email: EmailStr


class ChangePasswordRequest(BaseModel):
    """Request body for changing the authenticated user's password."""

    current_password: str
    new_password: str
