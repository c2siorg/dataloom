"""Pandas utility functions for safe file operations and response building."""

from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

SUPPORTED_FORMATS = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}


def _get_reader(suffix: str):
    readers = {
        ".csv": lambda p: pd.read_csv(p),
        ".tsv": lambda p: pd.read_csv(p, sep="\t"),
        ".xlsx": lambda p: pd.read_excel(p),
        ".xls": lambda p: pd.read_excel(p),
        ".json": lambda p: pd.read_json(p),
        ".parquet": lambda p: pd.read_parquet(p),
    }
    return readers.get(suffix)


def _get_writer(suffix: str):
    writers = {
        ".csv": lambda df, p: df.to_csv(p, index=False),
        ".tsv": lambda df, p: df.to_csv(p, sep="\t", index=False),
        ".xlsx": lambda df, p: df.to_excel(p, index=False),
        ".xls": lambda df, p: df.to_excel(p, index=False),
        ".json": lambda df, p: df.to_json(p, orient="records", indent=2),
        ".parquet": lambda df, p: df.to_parquet(p, index=False),
    }
    return writers.get(suffix)


def read_file_safe(path: Path | str) -> pd.DataFrame:
    """Read a file into a DataFrame based on its extension.

    Supports CSV, TSV, Excel (.xlsx/.xls), JSON, and Parquet.

    Args:
        path: Path to the file.

    Returns:
        DataFrame with the file contents.

    Raises:
        HTTPException: If the file cannot be read or format is unsupported.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    reader = _get_reader(suffix)

    if reader is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )
    try:
        return reader(path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}") from None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}") from e


def save_file_safe(df: pd.DataFrame, path: Path | str) -> None:
    """Save a DataFrame to a file based on its extension.

    Supports CSV, TSV, Excel (.xlsx/.xls), JSON, and Parquet.

    Args:
        df: DataFrame to save.
        path: Destination file path.

    Raises:
        HTTPException: If the file cannot be saved or format is unsupported.
    """
    path = Path(path)
    suffix = path.suffix.lower()
    writer = _get_writer(suffix)

    if writer is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{suffix}'. Supported: {', '.join(sorted(SUPPORTED_FORMATS))}",
        )
    try:
        writer(df, path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}") from e


# ── backward-compatible aliases so existing callers don't break ──────────────


def read_csv_safe(path: Path | str) -> pd.DataFrame:
    """Backward-compatible alias for read_file_safe. Prefer read_file_safe."""
    return read_file_safe(path)


def save_csv_safe(df: pd.DataFrame, path: Path | str) -> None:
    """Backward-compatible alias for save_file_safe. Prefer save_file_safe."""
    return save_file_safe(df, path)


# ── dtype helpers ────────────────────────────────────────────────────────────


def _map_dtype(dtype) -> str:
    """Map a pandas dtype to a short label string."""
    kind = dtype.kind
    if kind in ("i", "u"):
        return "int"
    elif kind == "f":
        return "float"
    elif kind == "b":
        return "bool"
    elif kind == "M":
        return "datetime"
    elif kind in ("O", "U", "S"):
        return "str"
    else:
        return "unknown"


def dataframe_to_response(df: pd.DataFrame) -> dict[str, Any]:
    """Convert a DataFrame to an API response dict.

    Args:
        df: Source DataFrame.

    Returns:
        Dict with columns, rows, row_count, and dtypes.
    """
    dtypes = {col: _map_dtype(dtype) for col, dtype in df.dtypes.items()}
    df = df.fillna("").replace([float("inf"), float("-inf")], "")
    return {
        "columns": df.columns.tolist(),
        "rows": df.values.tolist(),
        "row_count": len(df),
        "dtypes": dtypes,
    }


def validate_row_index(df: pd.DataFrame, index: int) -> None:
    """Validate that a row index is within DataFrame bounds.

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

    Raises:
        HTTPException: If index is out of range.
    """
    if index < 0 or index >= len(df.columns):
        raise HTTPException(
            status_code=400,
            detail=f"Column index {index} out of range (0-{len(df.columns) - 1})",
        )


def get_column_profile(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Return column-level statistical profile for a DataFrame.

    For each column returns dtype, null stats, unique count, and
    numeric distribution quartiles where applicable.

    Args:
        df: Source DataFrame.

    Returns:
        List of per-column profile dicts.
    """
    total_rows = len(df)
    profiles = []

    for col in df.columns:
        series = df[col]
        null_count = int(series.isnull().sum())
        profile: dict[str, Any] = {
            "name": col,
            "dtype": _map_dtype(series.dtype),
            "null_count": null_count,
            "null_pct": round(null_count / total_rows * 100, 2) if total_rows else 0.0,
            "unique_count": int(series.nunique()),
        }

        if pd.api.types.is_numeric_dtype(series):
            desc = series.describe()
            profile.update(
                {
                    "mean": round(float(desc["mean"]), 4),
                    "std": round(float(desc["std"]), 4),
                    "min": round(float(desc["min"]), 4),
                    "p25": round(float(desc["25%"]), 4),
                    "p50": round(float(desc["50%"]), 4),
                    "p75": round(float(desc["75%"]), 4),
                    "max": round(float(desc["max"]), 4),
                }
            )

        profiles.append(profile)

    return profiles


def compute_quality_score(df: pd.DataFrame) -> float:
    """Compute a composite data quality score between 0 and 100.

    Penalises null values and duplicate rows proportionally.

    Args:
        df: Source DataFrame.

    Returns:
        Quality score as a float (0 = worst, 100 = perfect).
    """
    total_rows = len(df)
    if total_rows == 0:
        return 0.0

    total_cells = total_rows * len(df.columns)
    null_penalty = df.isnull().sum().sum() / total_cells if total_cells else 0
    dup_penalty = df.duplicated().sum() / total_rows

    return round((1 - null_penalty) * (1 - dup_penalty) * 100, 1)
