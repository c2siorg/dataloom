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
    dtype = df[column].dtype
    if pd.api.types.is_string_dtype(dtype):
        return 'string'
    elif pd.api.types.is_numeric_dtype(dtype):
        return 'numeric'
    return 'unknown'


def apply_filter(df: pd.DataFrame, column: str, condition: str, value: str) -> pd.DataFrame:
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")

    col_type = get_column_type(df, column)
    if col_type == 'numeric':
        try:
            value = float(value)
        except ValueError:
            raise TransformationError(f"Invalid numeric value: {value}") from None

    ops = {
        '=': lambda: df[df[column] == value],
        '!=': lambda: df[df[column] != value],
        '>': lambda: df[df[column] > value],
        '<': lambda: df[df[column] < value],
        '>=': lambda: df[df[column] >= value],
        '<=': lambda: df[df[column] <= value],
        'contains': lambda: df[df[column].astype(str).str.contains(str(value), case=False, na=False)],
    }

    if condition not in ops:
        raise TransformationError(f"Unsupported filter condition: {condition}")

    return ops[condition]()


def apply_sort(df: pd.DataFrame, column: str, ascending: bool) -> pd.DataFrame:
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")
    return df.sort_values(by=column, ascending=ascending)


def add_row(df: pd.DataFrame, index: int) -> pd.DataFrame:
    if index < 0 or index > len(df):
        raise TransformationError(f"Row index {index} out of range (0-{len(df)})")

    new_row = pd.DataFrame([[" "] * len(df.columns)], columns=df.columns, index=[index])
    return pd.concat([df.iloc[:index], new_row, df.iloc[index:]]).reset_index(drop=True)


def delete_row(df: pd.DataFrame, index: int) -> pd.DataFrame:
    if index < 0 or index >= len(df):
        raise TransformationError(f"Row index {index} out of range (0-{len(df)-1})")
    return df.drop(index).reset_index(drop=True)


def add_column(df: pd.DataFrame, index: int, name: str) -> pd.DataFrame:
    if index < 0 or index > len(df.columns):
        raise TransformationError(f"Column index {index} out of range (0-{len(df.columns)})")

    df = df.copy()
    df.insert(index, name, None)
    return df


def delete_column(df: pd.DataFrame, index: int) -> pd.DataFrame:
    if index < 0 or index >= len(df.columns):
        raise TransformationError(f"Column index {index} out of range (0-{len(df.columns)-1})")

    column_name = df.columns[index]
    return df.drop(column_name, axis=1)


def change_cell_value(df: pd.DataFrame, row_index: int, col_index: int, value) -> pd.DataFrame:
    df = df.copy()

    if row_index >= len(df) or col_index >= len(df.columns) + 1:
        raise TransformationError("Row or column index out of bounds")

    column_name = df.columns[col_index - 1]
    df.at[row_index, column_name] = value
    return df


def fill_empty(df: pd.DataFrame, fill_value, column_index: int = None) -> pd.DataFrame:
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
    if col_index < 0 or col_index >= len(df.columns):
        raise TransformationError(f"Column index {col_index} out of range (0-{len(df.columns)-1})")
    if not new_name or not new_name.strip():
        raise TransformationError("Column name cannot be empty")
    df = df.copy()
    columns = list(df.columns)
    columns[col_index] = new_name.strip()
    df.columns = columns
    return df


def cast_data_type(df: pd.DataFrame, column: str, target_type: str) -> pd.DataFrame:
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
            true_vals = {"true", "yes", "1", "t", "y"}
            false_vals = {"false", "no", "0", "f", "n"}
            df[column] = df[column].apply(
                lambda x: True if str(x).strip().lower() in true_vals
                else (False if str(x).strip().lower() in false_vals else pd.NA)
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
    if column not in df.columns:
        raise TransformationError(f"Column '{column}' not found")
    df = df.copy()
    if pd.api.types.is_string_dtype(df[column]):
        df[column] = df[column].str.strip()
    return df


def drop_duplicates(df: pd.DataFrame, columns: str, keep) -> pd.DataFrame:
    col_list = [c.strip() for c in columns.split(',')]
    missing = [c for c in col_list if c not in df.columns]
    if missing:
        raise TransformationError(f"Columns {missing} not found in dataset")
    return df.drop_duplicates(subset=col_list, keep=keep)


def advanced_query(df: pd.DataFrame, query_string: str) -> pd.DataFrame:
    validate_query_string(query_string)
    query_string = query_string.replace("'", '"').strip()
    for col in df.columns:
        if not col.isidentifier():
            query_string = query_string.replace(col, f'`{col}`')
    logger.debug("Executing query: %s", query_string)
    return df.query(query_string, local_dict={"__builtins__": {}})


def pivot_table(df: pd.DataFrame, index: str, value: str, column: str = None, aggfunc: str = "sum") -> pd.DataFrame:
    index_cols = [c.strip() for c in index.split(',')]
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


def apply_logged_transformation(df: pd.DataFrame, action_type: str, action_details: dict) -> pd.DataFrame:
    if action_type == 'addRow':
        index = action_details['row_params']['index']
        return add_row(df, index)

    elif action_type == 'delRow':
        index = action_details['row_params']['index']
        if index < 0 or index >= len(df):
            raise TransformationError(f"Row index {index} out of range")
        return df.drop(index)

    elif action_type == "addCol":
        params = action_details.get("add_col_params") or action_details.get("col_params")
        index = params["index"]
        column_name = params["name"]
        return add_column(df, index, column_name)

    elif action_type == "delCol":
        params = action_details.get("del_col_params") or action_details.get("col_params")
        index = params["index"]
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

    elif action_type == "renameCol":
        col_index = action_details["rename_col_params"]["col_index"]
        new_name = action_details["rename_col_params"]["new_name"]
        return rename_column(df, col_index, new_name)

    elif action_type == "castDataType":
        column = action_details["cast_data_type_params"]["column"]
        target_type = action_details["cast_data_type_params"]["target_type"]
        return cast_data_type(df, column, target_type)

    elif action_type == "trimWhitespace":
        column = action_details["trim_whitespace_params"]["column"]
        return trim_whitespace(df, column)

    elif action_type == "dropNa":
        columns = action_details.get("drop_na_params", {}).get("columns")
        return drop_na(df, columns)

    else:
        logger.warning("Unknown action type in log replay: %s", action_type)
        return df
