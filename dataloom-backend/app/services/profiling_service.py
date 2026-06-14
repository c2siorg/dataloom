"""Data profiling service: descriptive statistics over a DataFrame.

Pure functions, no side effects — each takes a DataFrame and returns plain data;
the endpoint layer handles I/O. This mirrors ``transformation_service``'s style.

Scope is descriptive only ("what does this dataset look like?"). Quality
assessment (issue flags, scores, remediation) is a separate, later concern and
must not leak into these responses.

Conventions:
- All ``*_percentage`` fields are 0–100 (human-readable), never 0–1.
- Output is JSON-safe: ``None`` is emitted in place of ``NaN``/``inf`` so the
  values survive FastAPI serialization.
"""

import math
from typing import Any

import pandas as pd

from app.utils.pandas_helpers import map_dtype

# Number of most-frequent categorical values returned in a column profile.
TOP_VALUES_LIMIT = 10
# A value rarer than this share of non-null rows counts toward rare_value_count.
RARE_VALUE_THRESHOLD = 0.01
# unique_count / row_count at or above this marks a column high-cardinality.
HIGH_CARDINALITY_RATIO = 0.9
# |skew| below this (with mean≈median) is treated as roughly symmetric.
NORMAL_SKEW_THRESHOLD = 0.5
# Share of values equal to zero at or above this marks a column zero-inflated.
ZERO_INFLATED_THRESHOLD = 0.5
# String values treated as missing (matched case-insensitively after trimming).
MISSING_VALUE_SENTINELS = frozenset({"", "na", "n/a", "null", "none", "nan", "unknown", "-"})


def _coerce_sentinels(series: pd.Series) -> pd.Series:
    """Replace missing-value sentinel strings with NaN for object columns.

    Non-string columns are returned unchanged. Matching is case-insensitive and
    ignores surrounding whitespace, so "N/A", " na ", and "null" all count as
    missing alongside real NaN.
    """
    if map_dtype(series.dtype) != "str":
        return series
    normalized = series.map(lambda v: v.strip().lower() if isinstance(v, str) else v)
    return series.where(~normalized.isin(MISSING_VALUE_SENTINELS), other=None)


def _safe_number(value: Any) -> float | None:
    """Coerce a numeric value to a JSON-safe float, mapping NaN/inf to None."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _round(value: Any, ndigits: int = 4) -> float | None:
    """Round to a JSON-safe float, or None for missing/non-finite input."""
    number = _safe_number(value)
    return None if number is None else round(number, ndigits)


def dataset_summary(df: pd.DataFrame) -> dict[str, Any]:
    """Return a top-level overview of the whole dataset.

    Args:
        df: The DataFrame to summarize.

    Returns:
        Row/column counts, missing-cell totals, duplicate-row count, memory
        usage, the dtype mix, and the per-shape column name lists. Each list
        (numeric/categorical/boolean/datetime) groups columns by the
        ``column_profile`` block they produce, so a name from a given list is
        safe to feed back into ``column_profile`` expecting that shape.
    """
    row_count = int(df.shape[0])
    column_count = int(df.shape[1])
    total_cells = row_count * column_count
    total_missing = 0
    dtype_counts: dict[str, int] = {}
    numeric_columns: list[str] = []
    categorical_columns: list[str] = []
    boolean_columns: list[str] = []
    datetime_columns: list[str] = []
    for column in df.columns:
        label = map_dtype(df[column].dtype)
        dtype_counts[label] = dtype_counts.get(label, 0) + 1
        total_missing += int(_coerce_sentinels(df[column]).isna().sum())
        if label in ("int", "float"):
            numeric_columns.append(str(column))
        elif label == "str":
            categorical_columns.append(str(column))
        elif label == "bool":
            boolean_columns.append(str(column))
        elif label == "datetime":
            datetime_columns.append(str(column))

    missing_percentage = (total_missing / total_cells * 100) if total_cells else 0.0

    return {
        "row_count": row_count,
        "column_count": column_count,
        "total_missing_cells": total_missing,
        "missing_cell_percentage": round(missing_percentage, 4),
        "duplicate_row_count": int(df.duplicated().sum()),
        "memory_usage_bytes": int(df.memory_usage(deep=True).sum()),
        "dtype_counts": dtype_counts,
        "numeric_columns": numeric_columns,
        "categorical_columns": categorical_columns,
        "boolean_columns": boolean_columns,
        "datetime_columns": datetime_columns,
    }


def detect_distribution(
    *,
    unique_count: int,
    row_count: int,
    null_count: int,
    skew: float | None,
    zero_fraction: float | None,
) -> str:
    """Label the shape of a column's values from already-computed inputs.

    A lightweight, practical classifier — not a statistical test. All inputs are
    derived elsewhere in the profile, so this adds no extra passes over the data.

    Labels are checked in priority order, so the first match wins. Notably
    ``binary`` (exactly two distinct values) is tested before ``zero-inflated``,
    so a column like ``[0, 0, 0, 1]`` is labelled ``binary`` even when its
    zero share meets ``ZERO_INFLATED_THRESHOLD``; zero-inflation is only
    reported for columns with three or more distinct values.

    Returns one of: constant, binary, zero-inflated, high-cardinality,
    right-skewed, left-skewed, normal-ish, unknown.
    """
    non_null = row_count - null_count
    if non_null <= 0:
        return "unknown"
    if unique_count == 1:
        return "constant"
    if unique_count == 2:
        return "binary"
    if zero_fraction is not None and zero_fraction >= ZERO_INFLATED_THRESHOLD:
        return "zero-inflated"
    if unique_count / non_null >= HIGH_CARDINALITY_RATIO:
        return "high-cardinality"
    if skew is not None:
        if skew > NORMAL_SKEW_THRESHOLD:
            return "right-skewed"
        if skew < -NORMAL_SKEW_THRESHOLD:
            return "left-skewed"
        return "normal-ish"
    return "unknown"


def _infer_granularity(series: pd.Series) -> str | None:
    """Infer a coarse datetime cadence (day/month/year/...) from spacing.

    Uses the modal gap between sorted, de-duplicated timestamps. Returns None
    when there are fewer than two distinct values to compare.
    """
    values = series.dropna().sort_values().unique()
    if len(values) < 2:
        return None
    diffs = pd.Series(values).diff().dropna()
    if diffs.empty:
        return None
    modal = diffs.mode()
    if modal.empty:
        return None
    days = modal.iloc[0] / pd.Timedelta(days=1)
    if days < 1:
        return "sub-daily"
    if days < 2:
        return "day"
    if days < 8:
        return "week"
    if days < 32:
        return "month"
    if days < 250:
        return "quarter"
    return "year"


def _numeric_block(series: pd.Series) -> dict[str, Any]:
    """Descriptive statistics for a numeric column."""
    non_null = series.dropna()
    return {
        "mean": _round(series.mean()),
        "median": _round(series.median()),
        "min": _round(series.min()),
        "max": _round(series.max()),
        "std": _round(series.std()),
        "q1": _round(series.quantile(0.25)),
        "q3": _round(series.quantile(0.75)),
        "skew": _round(series.skew()),
        "zero_count": int((non_null == 0).sum()),
        "negative_count": int((non_null < 0).sum()),
    }


def _categorical_block(series: pd.Series) -> dict[str, Any]:
    """Frequency-based statistics for a categorical (str/bool) column."""
    non_null = series.dropna()
    counts = non_null.value_counts()
    total = int(non_null.shape[0])

    top_values = [
        {
            "value": str(value),
            "count": int(count),
            "percentage": round(count / total * 100, 4) if total else 0.0,
        }
        for value, count in counts.head(TOP_VALUES_LIMIT).items()
    ]

    dominant_percentage = round(int(counts.iloc[0]) / total * 100, 4) if total else None
    rare_value_count = int((counts < max(total * RARE_VALUE_THRESHOLD, 1)).sum()) if total else 0

    return {
        "top_values": top_values,
        "cardinality": int(counts.shape[0]),
        "dominant_value_percentage": dominant_percentage,
        "rare_value_count": rare_value_count,
    }


def _boolean_block(series: pd.Series) -> dict[str, Any]:
    """True/false counts for a boolean column."""
    non_null = series.dropna()
    total = int(non_null.shape[0])
    true_count = int(non_null.sum())  # bool sums as 1 per True
    return {
        "true_count": true_count,
        "false_count": total - true_count,
        "true_percentage": round(true_count / total * 100, 4) if total else None,
    }


def _datetime_block(series: pd.Series) -> dict[str, Any]:
    """Range statistics for a datetime column."""
    non_null = series.dropna()
    if non_null.empty:
        return {"min_date": None, "max_date": None, "range_days": None, "inferred_granularity": None}

    min_date = non_null.min()
    max_date = non_null.max()
    range_days = int((max_date - min_date) / pd.Timedelta(days=1))
    return {
        "min_date": min_date.isoformat(),
        "max_date": max_date.isoformat(),
        "range_days": range_days,
        "inferred_granularity": _infer_granularity(non_null),
    }


def column_profile(df: pd.DataFrame, column: str) -> dict[str, Any]:
    """Return a type-aware profile of a single column.

    Args:
        df: The DataFrame containing the column.
        column: Name of the column to profile.

    Returns:
        A common block (dtype, counts, null/unique percentages, distribution
        label) merged with a type-specific block (numeric, categorical, or
        datetime). The keys for the irrelevant blocks are simply absent.

    Raises:
        KeyError: If ``column`` is not present in ``df``.
    """
    if column not in df.columns:
        raise KeyError(column)

    series = _coerce_sentinels(df[column])
    label = map_dtype(series.dtype)
    row_count = int(series.shape[0])
    null_count = int(series.isna().sum())
    non_null_count = row_count - null_count
    unique_count = int(series.nunique(dropna=True))

    profile: dict[str, Any] = {
        "column": column,
        "dtype": label,
        "row_count": row_count,
        "null_count": null_count,
        "null_percentage": round(null_count / row_count * 100, 4) if row_count else 0.0,
        "unique_count": unique_count,
        "unique_percentage": round(unique_count / non_null_count * 100, 4) if non_null_count else 0.0,
    }

    skew: float | None = None
    zero_fraction: float | None = None
    if label in ("int", "float"):
        numeric_block = _numeric_block(series)
        profile.update(numeric_block)
        skew = numeric_block["skew"]
        if non_null_count:
            zero_fraction = float((series == 0).sum()) / non_null_count
    elif label == "bool":
        profile.update(_boolean_block(series))
    elif label == "str":
        profile.update(_categorical_block(series))
    elif label == "datetime":
        profile.update(_datetime_block(series))

    profile["distribution"] = detect_distribution(
        unique_count=unique_count,
        row_count=row_count,
        null_count=null_count,
        skew=skew,
        zero_fraction=zero_fraction,
    )
    return profile


def correlation_matrix(df: pd.DataFrame) -> dict[str, Any]:
    """Return the pairwise Pearson correlation over numeric columns.

    Args:
        df: The DataFrame to correlate.

    Returns:
        ``{"columns": [...], "matrix": [[...]]}`` where ``matrix[i][j]`` is the
        correlation between ``columns[i]`` and ``columns[j]``. Non-finite cells
        (e.g. a constant column has no variance) serialize to ``None``. With
        fewer than two numeric columns the result is a 0×0 / 1×1 matrix, never
        an error.
    """
    numeric_df = df.select_dtypes(include=["number"])
    columns = [str(c) for c in numeric_df.columns]
    if not columns:
        return {"columns": [], "matrix": []}

    corr = numeric_df.corr(method="pearson")
    matrix = [[_round(corr.iat[i, j]) for j in range(len(columns))] for i in range(len(columns))]
    return {"columns": columns, "matrix": matrix}
