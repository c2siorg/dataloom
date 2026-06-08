"""Pure transformation functions for dataset operations.

Each function takes a DataFrame and parameters, returns a new DataFrame.
No side effects -- saving to disk is handled by the caller.
"""

from collections.abc import Callable
from dataclasses import dataclass

import pandas as pd

from app.schemas import MeltParams, OperationType
from app.utils.logging import get_logger
from app.utils.security import validate_query_string

logger = get_logger(__name__)


class TransformationError(Exception):
    """Raised when a transformation cannot be applied due to invalid input."""

    pass


def get_column_type(df: pd.DataFrame, column: str) -> str:
    """Determine whether a column contains string or numeric data.

    Args:
        df: Source DataFrame.
        column: Column name to inspect.

    Returns:
        'string', 'numeric', or 'unknown'.
    """
    dtype = df[column].dtype
    if pd.api.types.is_string_dtype(dtype):
        return "string"
    elif pd.api.types.is_numeric_dtype(dtype):
        return "numeric"
    return "unknown"


def apply_filter(df: pd.DataFrame, column: str, condition: str, value: str) -> pd.DataFrame:
    """Filter DataFrame rows by a column condition.

    Automatically casts value to float for numeric columns.
    Column names are matched after stripping whitespace.

    Args:
        df: Source DataFrame.
        column: Column name to filter on.
        condition: One of '=', '!=', '>', '<', '>=', '<=', 'contains'.
        value: The comparison value (as string, cast if needed).

    Returns:
        Filtered DataFrame.

    Raises:
        TransformationError: If column not found or condition unsupported.
    """
    # Strip whitespace from column name and create a mapping of stripped -> original
    column_stripped = column.strip()
    stripped_to_original = {col.strip(): col for col in df.columns}

    if column_stripped not in stripped_to_original:
        available = list(df.columns)
        raise TransformationError(f"Column '{column}' not found. Available columns: {available}")

    # Use the original column name from the DataFrame
    column = stripped_to_original[column_stripped]

    # Cast value to numeric if column is numeric (for comparison operators)
    col_type = get_column_type(df, column)
    if col_type == "numeric" and condition in ("=", "!=", ">", "<", ">=", "<="):
        try:
            value = float(value)
        except ValueError:
            raise TransformationError(f"Invalid numeric value: {value}") from None

    ops = {
        "=": lambda: df[df[column] == value],
        "!=": lambda: df[df[column] != value],
        ">": lambda: df[df[column] > value],
        "<": lambda: df[df[column] < value],
        ">=": lambda: df[df[column] >= value],
        "<=": lambda: df[df[column] <= value],
        "contains": lambda: df[df[column].astype(str).str.contains(value, na=False)],
    }

    condition_str = condition.value if hasattr(condition, "value") else str(condition)

    if condition_str not in ops:
        raise TransformationError(f"Unsupported filter condition: {condition_str}")

    return ops[condition_str]()


def apply_sort(
    df: pd.DataFrame,
    column: str | None = None,
    ascending: bool = True,
    criteria: list[dict] | None = None,
) -> pd.DataFrame:
    """Sort a DataFrame by one or more columns.

    Supports both single-column (backward compatible) and multi-column sorting.

    Args:
        df: Source DataFrame.
        column: Single column name (backward compatible).
        ascending: Sort direction for single-column sort.
        criteria: List of dicts with 'column' and 'ascending' keys for multi-column sort.

    Returns:
        Sorted DataFrame.
    """
    if criteria is not None:
        if len(criteria) == 0:
            raise TransformationError("At least one sort criterion is required")

        columns = []
        ascending_list = []

        for criterion in criteria:
            col_name = criterion.get("column")
            if not col_name:
                raise TransformationError("Column name is required for each sort criterion")
            if col_name not in df.columns:
                raise TransformationError(f"Column '{col_name}' not found")
            columns.append(col_name)
            ascending_list.append(criterion.get("ascending", True))

        return df.sort_values(by=columns, ascending=ascending_list)

    # Single-column mode (backward compatible)
    if column is None:
        raise TransformationError("Column name is required for sorting")
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")
    return df.sort_values(by=column, ascending=ascending)


def add_row(df: pd.DataFrame, index: int) -> pd.DataFrame:
    """Insert a blank row at the specified index.

    Args:
        df: Source DataFrame.
        index: Row position for insertion.

    Returns:
        DataFrame with new row inserted.
    """
    if index < 0 or index > len(df):
        raise TransformationError(f"Row index {index} out of range (0-{len(df)})")

    new_row = pd.DataFrame([[" "] * len(df.columns)], columns=df.columns, index=[index])
    return pd.concat([df.iloc[:index], new_row, df.iloc[index:]]).reset_index(drop=True)


def delete_row(df: pd.DataFrame, index: int) -> pd.DataFrame:
    """Delete the row at the specified index.

    Args:
        df: Source DataFrame.
        index: Row position to delete.

    Returns:
        DataFrame with row removed.
    """
    if index < 0 or index >= len(df):
        raise TransformationError(f"Row index {index} out of range (0-{len(df) - 1})")
    return df.drop(index).reset_index(drop=True)


def add_column(df: pd.DataFrame, index: int, name: str) -> pd.DataFrame:
    """Insert a new empty column at the specified position.

    Args:
        df: Source DataFrame.
        index: Column position for insertion.
        name: Name for the new column.

    Returns:
        DataFrame with new column inserted.
    """
    if index < 0 or index > len(df.columns):
        raise TransformationError(f"Column index {index} out of range (0-{len(df.columns)})")

    df = df.copy()
    df.insert(index, name, None)
    return df


def delete_column(df: pd.DataFrame, index: int) -> pd.DataFrame:
    """Delete the column at the specified index.

    Args:
        df: Source DataFrame.
        index: Column position to delete.

    Returns:
        DataFrame with column removed.
    """
    if index < 0 or index >= len(df.columns):
        raise TransformationError(f"Column index {index} out of range (0-{len(df.columns) - 1})")

    column_name = df.columns[index]
    return df.drop(column_name, axis=1)


def change_cell_value(df: pd.DataFrame, row_index: int, col_index: int, value) -> pd.DataFrame:
    """Update a single cell value.

    Note: col_index is 1-based from the frontend (skipping S.No. column).

    Args:
        df: Source DataFrame.
        row_index: Row position (0-based).
        col_index: Column position (1-based from frontend).
        value: New cell value.

    Returns:
        DataFrame with updated cell.
    """
    df = df.copy()

    # col_index is 1-based (1..len(columns)); row_index is 0-based. Guard both
    # ends so a negative index can't silently wrap to the wrong cell.
    if row_index < 0 or row_index >= len(df) or col_index < 1 or col_index >= len(df.columns) + 1:
        raise TransformationError("Row or column index out of bounds")

    # col_index is 1-based from frontend (accounting for S.No. column)
    column_name = df.columns[col_index - 1]

    # Cast value to match the column's existing dtype so pandas doesn't reject
    # string values for numeric columns (the frontend always sends strings).
    col_dtype = df[column_name].dtype
    if value == "" or value is None:
        # Clearing a cell stores Python None. Numeric columns are upcast to
        # object so None can coexist with the remaining values (int64 has no
        # null sentinel; we upcast float64 too for consistency with the int
        # path, even though NaN would fit natively).
        if pd.api.types.is_integer_dtype(col_dtype) or pd.api.types.is_float_dtype(col_dtype):
            df[column_name] = df[column_name].astype(object)
        value = None
    else:
        try:
            if pd.api.types.is_integer_dtype(col_dtype):
                # Try int() first so large integer strings like
                # "9007199254740993" (above 2^53) keep full precision —
                # int(float(...)) would round-trip them through a 64-bit
                # float and lose bits. Fractional input ("31.7") falls
                # through to int(float(...)) and silently truncates;
                # truncation is kept deliberately so common typos like
                # "31.0" still round-trip cleanly. Non-numeric strings
                # ("hello") and out-of-range exponents ("1e500") raise and
                # fall through to the object-fallback branch below.
                try:
                    value = int(str(value).strip())
                except ValueError:
                    value = int(float(value))
            elif pd.api.types.is_float_dtype(col_dtype):
                value = float(value)
            elif pd.api.types.is_bool_dtype(col_dtype):
                # Accepted tokens are a superset of cast_data_type()'s, so a
                # value that cast-to-boolean would accept never gets rejected
                # by a cell edit.
                normalized = str(value).strip().lower()
                if normalized in ("true", "1", "yes", "t", "y", "on"):
                    value = True
                elif normalized in ("false", "0", "no", "f", "n", "off"):
                    value = False
                else:
                    raise TransformationError(
                        f"Cannot interpret {value!r} as boolean for column "
                        f"'{column_name}'. Expected one of: true/false, 1/0, "
                        "yes/no, t/f, y/n, on/off."
                    )
        except (ValueError, TypeError, OverflowError):
            # One uncoercible edit (e.g. "hello" in an int column, or an
            # out-of-range exponent like "1e500") demotes the whole column
            # to object dtype, preserving the user's input at the cost of
            # the column's type invariant. Loud failure would be safer but
            # the product choice is to keep the edit and let the UI surface
            # the dtype change.
            df[column_name] = df[column_name].astype(object)

    df.at[row_index, column_name] = value
    return df


def fill_empty(df: pd.DataFrame, fill_value, column_index: int = None) -> pd.DataFrame:
    """Fill empty/NaN cells with a specified value.

    Args:
        df: Source DataFrame.
        fill_value: Value to fill empty cells with.
        column_index: Optional specific column index. If None, fills all columns.

    Returns:
        DataFrame with empty cells filled.
    """
    df = df.copy()
    if column_index is not None:
        if column_index < 0 or column_index >= len(df.columns):
            raise TransformationError(f"Column index {column_index} out of range")
        column_name = df.columns[column_index]
        df[column_name] = df[column_name].fillna(fill_value)
    else:
        df = df.fillna(fill_value)
    return df


def rename_column(df: pd.DataFrame, col_index: int, new_name: str) -> pd.DataFrame:
    """Rename a column by its positional index.

    Args:
        df: Source DataFrame.
        col_index: 0-based column position.
        new_name: The new column name.

    Returns:
        DataFrame with the column renamed.

    Raises:
        TransformationError: If new_name is empty or whitespace.
        TransformationError: If col_index is out of range.
        TransformationError: If new_name already exists in df.columns
                             (unless new_name equals the current column name).
    """
    if col_index < 0 or col_index >= len(df.columns):
        raise TransformationError(
            f"Column index {col_index} is out of range (DataFrame has {len(df.columns)} columns)."
        )
    if not new_name or not new_name.strip():
        raise TransformationError("New column name cannot be empty or whitespace.")

    old_name = df.columns[col_index]

    # Check if new_name already exists and is different from current column name
    if new_name in df.columns and new_name != old_name:
        raise TransformationError(f"Column '{new_name}' already exists. Please choose a different name.")

    return df.rename(columns={old_name: new_name})


def cast_data_type(df: pd.DataFrame, column: str, target_type: str) -> pd.DataFrame:
    """Cast a column to a different data type.

    Args:
        df: Source DataFrame.
        column: Column name to cast.
        target_type: One of 'string', 'integer', 'float', 'boolean', 'datetime'.

    Returns:
        DataFrame with the column cast to the target type.
    """
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")

    df = df.copy()
    try:
        if target_type == "string":
            df[column] = df[column].astype(str)
        elif target_type in ("integer", "float"):
            df[column] = pd.to_numeric(df[column], errors="coerce")
            if target_type == "integer":
                # Use pandas' nullable Int64 so NaNs from coerced values coexist with ints.
                df[column] = df[column].astype("Int64")
        elif target_type == "boolean":
            truthy = {"true", "1", "yes", "y", "on"}
            falsy = {"false", "0", "no", "n", "off"}
            df[column] = df[column].apply(
                lambda v: (
                    True if str(v).strip().lower() in truthy else (False if str(v).strip().lower() in falsy else None)
                )
            )
        elif target_type == "datetime":
            df[column] = pd.to_datetime(df[column], errors="coerce")
        else:
            raise TransformationError(f"Unsupported target type: {target_type}")
    except TransformationError:
        raise
    except Exception as e:
        raise TransformationError(f"Failed to cast column '{column}' to {target_type}: {e}") from e

    return df


def trim_whitespace(df: pd.DataFrame, column: str) -> pd.DataFrame:
    """Trim leading and trailing whitespace from string columns.

    Args:
        df: Source DataFrame.
        column: Column name to trim, or "All string columns" to trim all string columns.

    Returns:
        DataFrame with whitespace trimmed from specified column(s).
    """
    df = df.copy()

    if column == "All string columns":
        for col in df.columns:
            if pd.api.types.is_string_dtype(df[col]) or pd.api.types.is_object_dtype(df[col]):
                df[col] = df[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
    else:
        if column not in df.columns:
            raise TransformationError(f"Column '{column}' not found")
        df[column] = df[column].apply(lambda x: x.strip() if isinstance(x, str) else x)

    return df


def string_replace(df: pd.DataFrame, column: str, find_value: str, replace_value: str) -> pd.DataFrame:
    """Replace occurrences of a substring in a column.

    Args:
        df: Source DataFrame.
        column: Column name to perform replacement on.
        find_value: The substring to find.
        replace_value: The string to replace it with.

    Returns:
        DataFrame with replacements applied.
    """
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")

    if not (pd.api.types.is_string_dtype(df[column]) or pd.api.types.is_object_dtype(df[column])):
        raise TransformationError(
            f"Column '{column}' is not a string column (dtype: {df[column].dtype}). "
            "Cast it to string first before using string replace."
        )

    df = df.copy()
    df[column] = df[column].astype(str).str.replace(find_value, replace_value, regex=False)
    return df


def drop_duplicates(df: pd.DataFrame, columns: str, keep) -> pd.DataFrame:
    """Remove duplicate rows based on specified columns.

    Args:
        df: Source DataFrame.
        columns: Comma-separated column names.
        keep: Which duplicates to keep ('first', 'last', or False for none).

    Returns:
        DataFrame with duplicates removed.
    """
    col_list = [c.strip() for c in columns.split(",")]

    missing = [c for c in col_list if c not in df.columns]
    if missing:
        raise TransformationError(f"Columns {missing} not found in dataset")

    return df.drop_duplicates(subset=col_list, keep=keep)


def advanced_query(df: pd.DataFrame, query_string: str) -> pd.DataFrame:
    """Filter DataFrame using a pandas query expression.

    Validates the query for injection attacks, normalizes quote characters,
    and wraps non-identifier column names in backticks.

    Args:
        df: Source DataFrame.
        query_string: Pandas query syntax string.

    Returns:
        Filtered DataFrame.
    """
    # Validate for injection patterns
    validate_query_string(query_string)

    # Normalize quotes
    query_string = query_string.replace("'", '"').strip()

    # Wrap non-identifier column names in backticks
    for col in df.columns:
        if not col.isidentifier():
            query_string = query_string.replace(col, f"`{col}`")

    logger.debug("Executing query: %s", query_string)
    return df.query(query_string, local_dict={"__builtins__": {}})


def pivot_table(df: pd.DataFrame, index: str, value: str, column: str = None, aggfunc: str = "sum") -> pd.DataFrame:
    """Create a pivot table from the DataFrame.

    Args:
        df: Source DataFrame.
        index: Comma-separated column names for the pivot index.
        value: Column to aggregate.
        column: Optional column to pivot on.
        aggfunc: Aggregation function name.

    Returns:
        Pivoted DataFrame with string column names and reset index.
    """
    index_cols = [c.strip() for c in index.split(",")]

    # Validate all required columns exist
    all_cols = index_cols + ([column] if column else []) + [value]
    missing = [c for c in all_cols if c not in df.columns]
    if missing:
        raise TransformationError(f"Columns {missing} not found in dataset")

    if column:
        result = pd.pivot_table(df, index=index_cols, values=value, columns=column, aggfunc=aggfunc)
    else:
        result = pd.pivot_table(df, index=index_cols, values=value, aggfunc=aggfunc)

    result.columns = result.columns.astype(str)
    return result.reset_index()


def drop_na(df: pd.DataFrame, columns: list[str] | None = None) -> pd.DataFrame:
    """Drop rows with missing/NaN values.

    Args:
        df: Source DataFrame.
        columns: Optional list of column names to check for NaN.
                 If None, drops rows where ANY column has NaN.

    Returns:
        DataFrame with NaN rows removed.
    """
    if columns is not None:
        if len(columns) == 0:
            raise TransformationError("columns list must not be empty")
        missing = [c for c in columns if c not in df.columns]
        if missing:
            raise TransformationError(f"Columns not found in dataset: {', '.join(missing)}")
        df = df.copy()
        return df.dropna(subset=columns).reset_index(drop=True)
    df = df.copy()
    return df.dropna().reset_index(drop=True)


def melt_dataframe(df: pd.DataFrame, params: MeltParams | dict) -> pd.DataFrame:
    """Unpivot a DataFrame from wide to long format.

    Args:
        df: Source DataFrame.
        params: MeltParams object or dictionary with id_vars, value_vars, var_name, value_name.

    Returns:
        Melted DataFrame.

    Raises:
        TransformationError: If columns are missing or overlap.
    """
    if isinstance(params, dict):
        id_vars = params.get("id_vars", [])
        value_vars = params.get("value_vars")
        var_name = params.get("var_name", "variable")
        value_name = params.get("value_name", "value")
    else:
        id_vars = params.id_vars
        value_vars = params.value_vars
        var_name = params.var_name
        value_name = params.value_name

    # Validate id_vars
    missing_id = [c for c in id_vars if c not in df.columns]
    if missing_id:
        raise TransformationError(f"ID variables {missing_id} not found in dataset")

    # Validate value_vars
    if value_vars:
        missing_val = [c for c in value_vars if c not in df.columns]
        if missing_val:
            raise TransformationError(f"Value variables {missing_val} not found in dataset")

        # Check for overlap
        overlap = set(id_vars).intersection(set(value_vars))
        if overlap:
            raise TransformationError(f"Columns cannot be both in id_vars and value_vars: {list(overlap)}")

    # Conflict: var_name/value_name must not match any id_vars (would duplicate columns in output)
    for name in [var_name, value_name]:
        if name in id_vars:
            raise TransformationError(
                f"Target column name '{name}' conflicts with an id_var column. "
                "Rename it with var_name/value_name parameters."
            )

    # Conflict: var_name and value_name are the same
    if var_name == value_name:
        raise TransformationError(f"var_name and value_name must be different (both set to '{var_name}').")

    try:
        return df.melt(id_vars=id_vars, value_vars=value_vars, var_name=var_name, value_name=value_name)
    except Exception as e:
        raise TransformationError(f"Melt operation failed: {str(e)}") from e


def group_by(df: pd.DataFrame, columns: list[str], agg_column: str, agg_function: str) -> pd.DataFrame:
    """Group DataFrame by columns and apply aggregation.

    Args:
        df: Source DataFrame.
        columns: List of column names to group by.
        agg_column: Column to aggregate.
        agg_function: One of sum, mean, count, min, max, median.

    Returns:
        Aggregated DataFrame with flat structure.

    Raises:
        TransformationError: If columns not found or invalid function.
    """
    all_cols = columns + [agg_column]
    missing = [c for c in all_cols if c not in df.columns]
    if missing:
        raise TransformationError(f"Columns {missing} not found in dataset")

    valid_functions = {"sum", "mean", "count", "min", "max", "median"}
    if agg_function not in valid_functions:
        raise TransformationError(f"Unsupported aggregation function: {agg_function}. Use: {valid_functions}")

    result = df.groupby(columns, as_index=False)[agg_column].agg(agg_function)
    result.columns = [str(c) for c in result.columns]
    for col in result.select_dtypes(include=["float"]).columns:
        result[col] = result[col].round(2)
    return result


def sample_rows(df: pd.DataFrame, sample_size: int, random_seed: int | None = None) -> pd.DataFrame:
    """Return a random sample of rows from the DataFrame.

    Args:
        df: Source DataFrame.
        sample_size: Number of rows to sample. Must be positive.
        random_seed: Optional seed for reproducibility (0 to 2^32-1).

    Returns:
        DataFrame with sampled rows and clean sequential indices.

    Raises:
        TransformationError: If sample_size is not positive.
    """
    if sample_size <= 0:
        raise TransformationError(f"Sample size must be positive, got {sample_size}")
    n_rows = len(df)
    actual_sample_size = min(sample_size, n_rows)
    if sample_size > n_rows:
        logger.warning("sample_size %d exceeds dataset length %d; clamping.", sample_size, n_rows)
    kwargs = {"n": actual_sample_size}
    if random_seed is not None:
        kwargs["random_state"] = random_seed
    sampled = df.sample(**kwargs)
    return sampled.reset_index(drop=True)


@dataclass(frozen=True)
class TransformationSpec:
    """Describes how to validate, dispatch, and persist one transformation.

    Attributes:
        func: Name of the pure transformation function in this module, resolved at
            dispatch time as ``func(df, *args)``. Stored as a name (not a direct
            reference) so the function stays a patchable module-level seam.
        params_field: Key of this transformation's parameters on the serialized
            ``TransformationInput`` dict (and on a log entry's ``action_details``).
            ``None`` means the transformation takes no parameter object.
        missing_error: Client-facing 400 detail raised by the execution path when
            ``params_field`` is absent. ``None`` skips the presence check (the
            parameters are optional, e.g. dropNa).
        persist: Whether a successful result is saved to disk and logged. Read-only
            previews (advanced query, pivot, melt) set this to ``False``.
        build_args: Maps the full serialized details dict to the positional args
            passed to ``func`` after ``df``.
        replay_tolerant: When ``True``, a replay whose parameters are missing/
            incomplete is skipped (returns ``df`` unchanged) instead of raising.
    """

    func: str
    params_field: str | None
    missing_error: str | None
    persist: bool
    build_args: Callable[[dict], tuple]
    replay_tolerant: bool = False


def _col_params(details: dict, field: str) -> dict:
    """Resolve column params, falling back to the legacy ``col_params`` log key."""
    return details.get(field) or details.get("col_params")


def resolve_transformation(name: str) -> Callable[..., pd.DataFrame]:
    """Resolve a registry function name to the current module-level callable.

    Looked up dynamically so tests (and any future wrapping) can patch the
    function on this module and have both the execution and replay paths honor it.
    """
    return globals()[name]


TRANSFORMATION_REGISTRY: dict[OperationType, TransformationSpec] = {
    OperationType.filter: TransformationSpec(
        func="apply_filter",
        params_field="parameters",
        missing_error="Filter parameters required",
        persist=True,
        build_args=lambda d: (d["parameters"]["column"], d["parameters"]["condition"], d["parameters"]["value"]),
    ),
    OperationType.sort: TransformationSpec(
        func="apply_sort",
        params_field="sort_params",
        missing_error="Sort parameters required",
        persist=True,
        build_args=lambda d: (
            d["sort_params"].get("column"),
            d["sort_params"].get("ascending", True),
            d["sort_params"].get("criteria"),
        ),
    ),
    OperationType.addRow: TransformationSpec(
        func="add_row",
        params_field="row_params",
        missing_error="Row parameters required",
        persist=True,
        build_args=lambda d: (d["row_params"]["index"],),
    ),
    OperationType.delRow: TransformationSpec(
        func="delete_row",
        params_field="row_params",
        missing_error="Row parameters required",
        persist=True,
        build_args=lambda d: (d["row_params"]["index"],),
    ),
    OperationType.addCol: TransformationSpec(
        func="add_column",
        params_field="add_col_params",
        missing_error="Column parameters required",
        persist=True,
        build_args=lambda d: (
            _col_params(d, "add_col_params")["index"],
            _col_params(d, "add_col_params")["name"],
        ),
    ),
    OperationType.delCol: TransformationSpec(
        func="delete_column",
        params_field="del_col_params",
        missing_error="Column index required",
        persist=True,
        build_args=lambda d: (_col_params(d, "del_col_params")["index"],),
    ),
    OperationType.changeCellValue: TransformationSpec(
        func="change_cell_value",
        params_field="change_cell_value",
        missing_error="Cell value parameters required",
        persist=True,
        build_args=lambda d: (
            d["change_cell_value"]["row_index"],
            d["change_cell_value"]["col_index"],
            d["change_cell_value"]["fill_value"],
        ),
    ),
    OperationType.fillEmpty: TransformationSpec(
        func="fill_empty",
        params_field="fill_empty_params",
        missing_error="Fill parameters required",
        persist=True,
        build_args=lambda d: (d["fill_empty_params"]["fill_value"], d["fill_empty_params"].get("index")),
    ),
    OperationType.renameCol: TransformationSpec(
        func="rename_column",
        params_field="rename_col_params",
        missing_error="Rename column parameters required",
        persist=True,
        build_args=lambda d: (d["rename_col_params"]["col_index"], d["rename_col_params"]["new_name"]),
    ),
    OperationType.castDataType: TransformationSpec(
        func="cast_data_type",
        params_field="cast_data_type_params",
        missing_error="Cast data type parameters required",
        persist=True,
        build_args=lambda d: (d["cast_data_type_params"]["column"], d["cast_data_type_params"]["target_type"]),
    ),
    OperationType.trimWhitespace: TransformationSpec(
        func="trim_whitespace",
        params_field="trim_whitespace_params",
        missing_error="Trim whitespace parameters required",
        persist=True,
        build_args=lambda d: (d["trim_whitespace_params"]["column"],),
    ),
    OperationType.sample: TransformationSpec(
        func="sample_rows",
        params_field="sample_params",
        missing_error="Sample parameters required",
        persist=True,
        build_args=lambda d: (d["sample_params"]["sample_size"], d["sample_params"].get("random_seed")),
    ),
    OperationType.stringReplace: TransformationSpec(
        func="string_replace",
        params_field="string_replace_params",
        missing_error="String replace parameters required",
        persist=True,
        build_args=lambda d: (
            d["string_replace_params"]["column"],
            d["string_replace_params"]["find_value"],
            d["string_replace_params"]["replace_value"],
        ),
        replay_tolerant=True,
    ),
    OperationType.dropDuplicate: TransformationSpec(
        func="drop_duplicates",
        params_field="drop_duplicate",
        missing_error="Drop duplicate parameters required",
        persist=True,
        build_args=lambda d: (d["drop_duplicate"]["columns"], d["drop_duplicate"]["keep"]),
    ),
    OperationType.advQueryFilter: TransformationSpec(
        func="advanced_query",
        params_field="adv_query",
        missing_error="Query parameter required",
        persist=False,
        build_args=lambda d: (d["adv_query"]["query"],),
    ),
    OperationType.pivotTables: TransformationSpec(
        func="pivot_table",
        params_field="pivot_query",
        missing_error="Pivot parameters required",
        persist=False,
        build_args=lambda d: (
            d["pivot_query"]["index"],
            d["pivot_query"]["value"],
            d["pivot_query"]["column"],
            d["pivot_query"]["aggfun"],
        ),
    ),
    OperationType.dropNa: TransformationSpec(
        func="drop_na",
        params_field="drop_na_params",
        missing_error=None,
        persist=True,
        build_args=lambda d: ((d.get("drop_na_params") or {}).get("columns"),),
    ),
    OperationType.melt: TransformationSpec(
        func="melt_dataframe",
        params_field="melt_params",
        missing_error="Melt parameters required",
        persist=False,
        build_args=lambda d: (d["melt_params"],),
    ),
    OperationType.groupby: TransformationSpec(
        func="group_by",
        params_field="groupby_params",
        missing_error="GroupBy parameters required",
        persist=True,
        build_args=lambda d: (
            d["groupby_params"]["columns"],
            d["groupby_params"]["agg_column"],
            d["groupby_params"]["agg_function"],
        ),
    ),
}

# Fail loudly at import if a new OperationType is added without a registry entry,
# keeping the enum and the registry from drifting apart.
_missing = set(OperationType) - set(TRANSFORMATION_REGISTRY)
if _missing:
    raise RuntimeError(f"OperationType members missing a TRANSFORMATION_REGISTRY entry: {sorted(_missing)}")


def apply_logged_transformation(df: pd.DataFrame, action_type: str, action_details: dict) -> pd.DataFrame:
    """Replay a logged transformation from its serialized form.

    Used by the save endpoint to apply pending transformations to the original
    dataset file. Each action_details dict contains the serialized parameters
    from the original TransformationInput, so dispatch resolves through the same
    TRANSFORMATION_REGISTRY the execution path uses.

    Args:
        df: Source DataFrame.
        action_type: The operation type string.
        action_details: Dict of the full transformation parameters.

    Returns:
        Transformed DataFrame.

    Raises:
        TransformationError: If the transformation cannot be applied.
    """
    spec = TRANSFORMATION_REGISTRY.get(action_type)
    if spec is None:
        logger.warning("Unknown action type in log replay: %s", action_type)
        raise TransformationError(f"Unknown action type in log replay: {action_type}")

    try:
        args = spec.build_args(action_details)
    except (KeyError, TypeError):
        if spec.replay_tolerant:
            logger.warning("Missing params for %s replay: %s", action_type, action_details)
            return df
        raise

    return resolve_transformation(spec.func)(df, *args)
