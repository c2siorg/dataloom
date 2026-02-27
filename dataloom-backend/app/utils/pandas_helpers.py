"""Pandas utility functions for safe CSV operations and response building."""

import math
import pandas as pd
from pathlib import Path
from typing import Any
from fastapi import HTTPException


DEFAULT_PAGE_SIZE = 50


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
        raise HTTPException(status_code=404, detail=f"CSV file not found: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading CSV: {str(e)}")


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
        raise HTTPException(status_code=500, detail=f"Error saving CSV: {str(e)}")


def dataframe_to_response(df: pd.DataFrame) -> dict[str, Any]:
    """Convert a DataFrame to an API response dict.

    Args:
        df: Source DataFrame.

    Returns:
        Dict with columns (list of str), rows (list of lists), and row_count.
    """
    df = df.fillna("")
    df = df.replace([float('inf'), float('-inf')], "")
    columns = df.columns.tolist()
    rows = df.values.tolist()
    return {"columns": columns, "rows": rows, "row_count": len(rows)}


def dataframe_to_paginated_response(
    df: pd.DataFrame,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> dict[str, Any]:
    """Convert a DataFrame to a paginated API response dict.

    Applies transformations to the full DataFrame but returns only the
    requested page of rows along with pagination metadata.

    Args:
        df: Source DataFrame (full dataset).
        page: Page number (1-indexed).
        page_size: Number of rows per page.

    Returns:
        Dict with columns, paginated rows, row_count (page size),
        total_rows, total_pages, page, and page_size.
    """
    df = df.fillna("")
    df = df.replace([float('inf'), float('-inf')], "")
    columns = df.columns.tolist()
    total_rows = len(df)

    # Handle empty dataset
    if total_rows == 0:
        return {
            "columns": columns,
            "rows": [],
            "row_count": 0,
            "total_rows": 0,
            "total_pages": 0,
            "page": page,
            "page_size": page_size,
        }

    # Calculate total pages
    total_pages = math.ceil(total_rows / page_size) if page_size > 0 else 1

    # Clamp page to valid range
    page = max(1, min(page, total_pages))

    # Calculate slice indices
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total_rows)

    # Slice the DataFrame
    paginated_df = df.iloc[start_idx:end_idx]
    rows = paginated_df.values.tolist()

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "total_rows": total_rows,
        "total_pages": total_pages,
        "page": page,
        "page_size": page_size,
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
            detail=f"Row index {index} out of range (0-{len(df)-1})",
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
            detail=f"Column index {index} out of range (0-{len(df.columns)-1})",
        )
