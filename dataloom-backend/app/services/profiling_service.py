"""Column-level profiling service for DataLoom.

Computes per-column statistics from a DataFrame and returns them in a
structure that is safe to serialise via Pydantic / FastAPI.

Numeric columns get:  min, max, mean, std, p25, p50, p75
Categorical columns get: top_values (up to 5 most frequent values)

All columns get: dtype label, total count, null_count, null_pct, unique_count.
"""

from typing import Any

import pandas as pd

from app.utils.logging import get_logger
from app.utils.pandas_helpers import _map_dtype

logger = get_logger(__name__)


def _safe_float(value: Any) -> float | None:
    """Convert a value to a Python float, returning None for NaN/inf."""
    try:
        f = float(value)
        if pd.isna(f) or f == float("inf") or f == float("-inf"):
            return None
        return round(f, 4)
    except (TypeError, ValueError):
        return None


def profile_dataframe(df: pd.DataFrame) -> list[dict]:
    """Compute per-column statistics for a DataFrame.

    Args:
        df: The DataFrame to profile.

    Returns:
        A list of column profile dicts, one per column, each containing
        at minimum: column, dtype, count, null_count, null_pct, unique_count.
        Numeric columns also contain: min, max, mean, std, p25, p50, p75.
        Non-numeric columns also contain: top_values (dict of value→count).
    """
    profiles: list[dict] = []

    for col in df.columns:
        series = df[col]
        total = len(series)
        null_count = int(series.isna().sum())
        null_pct = round(null_count / total * 100, 2) if total > 0 else 0.0
        unique_count = int(series.nunique(dropna=True))

        profile: dict = {
            "column": col,
            "dtype": _map_dtype(series.dtype),
            "count": total,
            "null_count": null_count,
            "null_pct": null_pct,
            "unique_count": unique_count,
        }

        if pd.api.types.is_numeric_dtype(series):
            desc = series.describe()
            profile.update(
                {
                    "min": _safe_float(desc.get("min")),
                    "max": _safe_float(desc.get("max")),
                    "mean": _safe_float(desc.get("mean")),
                    "std": _safe_float(desc.get("std")),
                    "p25": _safe_float(desc.get("25%")),
                    "p50": _safe_float(desc.get("50%")),
                    "p75": _safe_float(desc.get("75%")),
                }
            )
        else:
            top = (
                series.dropna()
                .astype(str)
                .value_counts()
                .head(5)
                .to_dict()
            )
            profile["top_values"] = {str(k): int(v) for k, v in top.items()}

        profiles.append(profile)
        logger.debug("Profiled column: %s (%s), nulls=%d", col, profile["dtype"], null_count)

    return profiles