"""Pandas utility functions for safe CSV operations and response building."""

import math
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


def _normalize_response_value(value: Any) -> Any:
    """Normalize a DataFrame cell for JSON response serialization.

    Preserves real empty strings while converting missing or non-finite
    values to ``None`` so the API can distinguish ``null`` from ``""``.
    """
    if value is None:
        return None

    try:
        missing = pd.isna(value)
        # pd.isna can return array-like values for non-scalar inputs
        # (for example, lists). Only treat scalar truthy results as missing.
        if isinstance(missing, bool):
            if missing:
                return None
        elif getattr(missing, "ndim", None) == 0 and bool(missing):
            return None
    except (TypeError, ValueError):
        pass

    try:
        if math.isinf(value):
            return None
    except (TypeError, ValueError):
        pass

    return value


def dataframe_to_response(df: pd.DataFrame) -> dict[str, Any]:
    """Convert a DataFrame to an API response dict.

    Args:
        df: Source DataFrame.

    Returns:
        Dict with columns (list of str), rows (list of lists), row_count, and dtypes.
    """
    dtypes = {col: _map_dtype(dtype) for col, dtype in df.dtypes.items()}
    columns = df.columns.tolist()
    rows = [[_normalize_response_value(value) for value in row] for row in df.astype(object).values.tolist()]
    return {"columns": columns, "rows": rows, "row_count": len(rows), "dtypes": dtypes}


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
