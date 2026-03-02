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
            raise TransformationError(f"Invalid numeric value: {value}") from None

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

    else:
        logger.warning("Unknown action type in log replay: %s", action_type)
        return df
