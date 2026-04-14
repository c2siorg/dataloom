"""Pandas utility functions for safe CSV operations and response building."""

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException


def read_csv_safe(path: Path) -> pd.DataFrame:
    """Read a CSV file safely with error handling.

    Args:
        path: Path to the CSV file.

    Returns:
        DataFrame with the CSV contents.

    Raises:
        HTTPException: If the file cannot be read.
    """
    try:
        return pd.read_csv(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"CSV file not found: {path}") from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading CSV: {str(e)}") from e


def save_csv_safe(df: pd.DataFrame, path: Path) -> None:
    """Save a DataFrame to CSV safely.

    Args:
        df: DataFrame to save.
        path: Destination file path.

    Raises:
        HTTPException: If the file cannot be saved.
    """
    try:
        df.to_csv(path, index=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving CSV: {str(e)}") from e


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
    return {"columns": columns, "rows": rows, "row_count": len(rows), "dtypes": dtypes}
