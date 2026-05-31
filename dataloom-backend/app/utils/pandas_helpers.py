"""Pandas utility functions for safe multi-format I/O and response building."""

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

from app.utils.file_formats import get_format


def read_table_safe(path: Path) -> pd.DataFrame:
    """Read a dataset file safely, dispatching on its format, with error handling.

    The format is resolved from the file extension via the format registry, so
    CSV/TSV/JSON/XLSX/Parquet all flow through this single helper.

    Args:
        path: Path to the dataset file.

    Returns:
        DataFrame with the file contents.

    Raises:
        HTTPException: 404 if the file is missing, 400 if the contents are
            invalid for the format (e.g. JSON nested too deeply), 500 otherwise.
    """
    try:
        return get_format(path).read(Path(path))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}") from e


def save_table_safe(df: pd.DataFrame, path: Path) -> None:
    """Save a DataFrame safely, dispatching on the destination file's format.

    Args:
        df: DataFrame to save.
        path: Destination file path; its extension selects the writer.

    Raises:
        HTTPException: If the file cannot be saved.
    """
    try:
        get_format(path).write(df, Path(path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}") from e


def _map_dtype(dtype) -> str:
    """Map a pandas dtype to a short label string."""
    kind = dtype.kind
    if kind == "i" or kind == "u":
        return "int"
    elif kind == "f":
        return "float"
    elif kind == "b":
        return "bool"
    elif kind == "M":
        return "datetime"
    elif kind == "O" or kind == "U" or kind == "S":
        return "str"
    else:
        return "unknown"


def dataframe_to_response(df: pd.DataFrame) -> dict[str, Any]:
    """Convert a DataFrame to an API response dict.

    Args:
        df: Source DataFrame.

    Returns:
        Dict with columns (list of str), rows (list of lists), row_count, and dtypes.
    """

    dtypes = {col: _map_dtype(dtype) for col, dtype in df.dtypes.items()}
    df = df.fillna("")
    df = df.replace([float("inf"), float("-inf")], "")
    columns = df.columns.tolist()
    rows = df.values.tolist()
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "dtypes": dtypes,
    }


def validate_row_index(df: pd.DataFrame, index: int) -> None:
    """Validate that a row index is within DataFrame bounds.

    Args:
        df: Source DataFrame.
        index: Row index to validate.

    Raises:
        HTTPException: If index is out of range.
    """
    if index < 0 or index >= len(df):
        raise HTTPException(
            status_code=400,
            detail=f"Row index {index} out of range (0-{len(df) - 1})",
        )


def validate_column_index(df: pd.DataFrame, index: int) -> None:
    """Validate that a column index is within DataFrame bounds.

    Args:
        df: Source DataFrame.
        index: Column index to validate.

    Raises:
        HTTPException: If index is out of range.
    """
    if index < 0 or index >= len(df.columns):
        raise HTTPException(
            status_code=400,
            detail=f"Column index {index} out of range (0-{len(df.columns) - 1})",
        )
