"""Pure transformation functions for dataset operations.

Each function takes a DataFrame and parameters, returns a new DataFrame.
No side effects -- saving to disk is handled by the caller.
"""

import pandas as pd
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
        return 'string'
    elif pd.api.types.is_numeric_dtype(dtype):
        return 'numeric'
    return 'unknown'


def apply_filter(df: pd.DataFrame, column: str, condition: str, value: str) -> pd.DataFrame:
    """Filter DataFrame rows by a column condition.

    Automatically casts value to float for numeric columns.

    Args:
        df: Source DataFrame.
        column: Column name to filter on.
        condition: One of '=', '>', '<', '>=', '<='.
        value: The comparison value (as string, cast if needed).

    Returns:
        Filtered DataFrame.

    Raises:
        TransformationError: If column not found or condition unsupported.
    """
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")

    # Cast value to numeric if column is numeric
    col_type = get_column_type(df, column)
    if col_type == 'numeric':
        try:
            value = float(value)
        except ValueError:
            raise TransformationError(f"Invalid numeric value: {value}")

    ops = {
        '=': lambda: df[df[column] == value],
        '>': lambda: df[df[column] > value],
        '<': lambda: df[df[column] < value],
        '>=': lambda: df[df[column] >= value],
        '<=': lambda: df[df[column] <= value],
    }

    if condition not in ops:
        raise TransformationError(f"Unsupported filter condition: {condition}")

    return ops[condition]()


def apply_sort(df: pd.DataFrame, column: str, ascending: bool) -> pd.DataFrame:
    """Sort DataFrame by a column.

    Args:
        df: Source DataFrame.
        column: Column name to sort by.
        ascending: Sort direction.

    Returns:
        Sorted DataFrame.
    """
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
        raise TransformationError(f"Row index {index} out of range (0-{len(df)-1})")
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
        raise TransformationError(f"Column index {index} out of range (0-{len(df.columns)-1})")

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

    if row_index >= len(df) or col_index >= len(df.columns) + 1:
        raise TransformationError("Row or column index out of bounds")

    # col_index is 1-based from frontend (accounting for S.No. column)
    column_name = df.columns[col_index - 1]
    column_dtype = df[column_name].dtype

    # Convert value to match column dtype
    try:
        if pd.api.types.is_integer_dtype(column_dtype):
            value = int(value)
        elif pd.api.types.is_float_dtype(column_dtype):
            value = float(value)
        elif pd.api.types.is_bool_dtype(column_dtype):
            value = bool(value)
    except (ValueError, TypeError) as e:
        raise TransformationError(
            f"Cannot convert value '{value}' to column type '{column_dtype}'"
        ) from e

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
    """
    if col_index < 0 or col_index >= len(df.columns):
        raise TransformationError(f"Column index {col_index} out of range (0-{len(df.columns)-1})")
    if not new_name or not new_name.strip():
        raise TransformationError("New column name cannot be empty")

    old_name = df.columns[col_index]
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
        elif target_type == "integer":
            df[column] = pd.to_numeric(df[column], errors="coerce").astype("Int64")
        elif target_type == "float":
            df[column] = pd.to_numeric(df[column], errors="coerce")
        elif target_type == "boolean":
            truthy = {"true", "1", "yes", "y", "on"}
            falsy = {"false", "0", "no", "n", "off"}
            df[column] = df[column].apply(
                lambda v: True if str(v).strip().lower() in truthy
                else (False if str(v).strip().lower() in falsy else None)
            ).astype("boolean")
        elif target_type == "datetime":
            df[column] = pd.to_datetime(df[column], errors="coerce")
        else:
            raise TransformationError(f"Unsupported target type: {target_type}")
    except TransformationError:
        raise
    except Exception as e:
        raise TransformationError(f"Failed to cast column '{column}' to {target_type}: {e}") from e

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
    col_list = [c.strip() for c in columns.split(',')]

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
            query_string = query_string.replace(col, f'`{col}`')

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
    index_cols = [c.strip() for c in index.split(',')]

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


def apply_logged_transformation(df: pd.DataFrame, action_type: str, action_details: dict) -> pd.DataFrame:
    """Replay a logged transformation from its serialized form.

    Used by the save endpoint to apply pending transformations to the original
    dataset file. Each action_details dict contains the serialized parameters
    from the original TransformationInput.

    Args:
        df: Source DataFrame.
        action_type: The operation type string.
        action_details: Dict of the full transformation parameters.

    Returns:
        Transformed DataFrame.

    Raises:
        TransformationError: If the transformation cannot be applied.
    """
    if action_type == 'addRow':
        index = action_details['row_params']['index']
        return add_row(df, index)

    elif action_type == 'delRow':
        index = action_details['row_params']['index']
        if index < 0 or index >= len(df):
            raise TransformationError(f"Row index {index} out of range")
        return df.drop(index)

    elif action_type == 'addCol':
        index = action_details['col_params']['index']
        column_name = action_details['col_params']['name']
        return add_column(df, index, column_name)

    elif action_type == 'delCol':
        index = action_details['col_params']['index']
        return delete_column(df, index)

    elif action_type == 'changeCellValue':
        row_index = action_details['change_cell_value']['row_index']
        col_index = action_details['change_cell_value']['col_index']
        new_value = action_details['change_cell_value']['fill_value']
        return change_cell_value(df, row_index, col_index, new_value)

    elif action_type == 'fillEmpty':
        fill_value = action_details['fill_empty_params']['fill_value']
        column_index = action_details['fill_empty_params'].get('index')
        return fill_empty(df, fill_value, column_index)

    elif action_type == 'dropDuplicate':
        columns = action_details['drop_duplicate']['columns']
        keep = action_details['drop_duplicate']['keep']
        return drop_duplicates(df, columns, keep)

    elif action_type == 'renameCol':
        col_index = action_details['rename_col_params']['col_index']
        new_name = action_details['rename_col_params']['new_name']
        return rename_column(df, col_index, new_name)

    elif action_type == 'castDataType':
        column = action_details['cast_data_type_params']['column']
        target_type = action_details['cast_data_type_params']['target_type']
        return cast_data_type(df, column, target_type)

    elif action_type == 'filter':
        column = action_details['parameters']['column']
        condition = action_details['parameters']['condition']
        value = action_details['parameters']['value']
        return apply_filter(df, column, condition, value)

    elif action_type == 'sort':
        column = action_details['sort_params']['column']
        ascending = action_details['sort_params']['ascending']
        return apply_sort(df, column, ascending)

    elif action_type == 'advQueryFilter':
        query_string = action_details['adv_query']['query']
        return advanced_query(df, query_string)

    elif action_type == 'pivotTables':
        index = action_details['pivot_query']['index']
        value = action_details['pivot_query']['value']
        column = action_details['pivot_query'].get('column')
        aggfunc = action_details['pivot_query'].get('aggfun', 'sum')
        return pivot_table(df, index, value, column, aggfunc)

    else:
        logger.warning("Unknown action type in log replay: %s", action_type)
        return df
