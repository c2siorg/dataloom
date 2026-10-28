"""Pure functions for relational dataset merging and pre-join alignment analysis.

Each function takes DataFrames and parameters, returning pure data structures or
new DataFrames without side effects. File I/O and persistence are managed by the
endpoint layer. This mirrors DataLoom's ``transformation_service`` and
``append_service`` design philosophy.
"""

from __future__ import annotations

import uuid
from enum import StrEnum
from typing import Any

import numpy as np
import pandas as pd

from app.schemas import JoinType
from app.services.transformation_service import TransformationError
from app.utils.pandas_helpers import map_dtype


class MergeError(TransformationError):
    """Raised when a dataset merge or analysis fails due to invalid inputs or safety violations."""

    pass


class RelationshipType(StrEnum):
    """Cardinality relationships between left and right join keys."""

    ONE_TO_ONE = "one-to-one"
    ONE_TO_MANY = "one-to-many"
    MANY_TO_ONE = "many-to-one"
    MANY_TO_MANY = "many-to-many"
    CROSS = "cross"


def _normalize_key_list(keys: list[str] | str | None) -> list[str]:
    """Normalize a single key string or list of key strings into a non-empty list of stripped strings."""
    if keys is None:
        return []
    if isinstance(keys, str):
        parts = [k.strip() for k in keys.split(",") if k.strip()]
        return parts
    return [str(k).strip() for k in keys if str(k).strip()]


def validate_merge_keys(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    left_on: list[str] | str | None,
    right_on: list[str] | str | None,
    how: str | JoinType,
) -> tuple[list[str], list[str]]:
    """Validate and normalize left and right keys for a given join method.

    Returns:
        Tuple of (left_keys, right_keys).

    Raises:
        MergeError: If join keys are missing, mismatched in count, or not found in datasets.
    """
    how_str = how.value if hasattr(how, "value") else str(how).lower()
    left_keys = _normalize_key_list(left_on)
    right_keys = _normalize_key_list(right_on)

    if how_str in (JoinType.cross, JoinType.CROSS, "cross"):
        return [], []

    if not left_keys or not right_keys:
        raise MergeError(f"Join keys ('left_on' and 'right_on') are required for {how_str} join.")
    if len(left_keys) != len(right_keys):
        raise MergeError(f"Number of left keys ({len(left_keys)}) does not match right keys ({len(right_keys)}).")

    missing_left = [k for k in left_keys if k not in left_df.columns]
    if missing_left:
        raise MergeError(f"Left key column(s) {missing_left} not found in left dataset.")

    missing_right = [k for k in right_keys if k not in right_df.columns]
    if missing_right:
        raise MergeError(f"Right key column(s) {missing_right} not found in right dataset.")

    return left_keys, right_keys


def _build_shadow_keys(df: pd.DataFrame, keys: list[str], prefix: str) -> pd.Series:
    """Build comparable shadow keys for matching where NaNs never equal NaNs and types align cleanly.

    - Generates unique non-matching tokens for every NaN value so missing keys never compare equal or join.
    - Preserves string keys with leading zeros (e.g. '007') as exact text without converting to numbers.
    - Handles single and composite multi-column keys identically with tuple aggregation.
    """

    def _format_component(series: pd.Series) -> pd.Series:
        def _fmt(val):
            if pd.isna(val):
                return f"__loom_null_{prefix}_{uuid.uuid4().hex}__"
            if isinstance(val, (int, np.integer)):
                return str(val)
            if isinstance(val, (float, np.floating)):
                return str(int(val)) if val.is_integer() else str(val)
            return str(val)

        return series.map(_fmt)

    if not keys:
        return pd.Series(index=df.index, dtype=object)

    formatted_cols = [_format_component(df[k]) for k in keys]
    if len(formatted_cols) == 1:
        return formatted_cols[0]

    return pd.Series(list(zip(*formatted_cols, strict=False)), index=df.index)


def detect_relationship(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    left_keys: list[str],
    right_keys: list[str],
) -> RelationshipType:
    """Determine the cardinality relationship (1:1, 1:N, N:1, N:M) between join keys.

    Args:
        left_df: Primary left DataFrame.
        right_df: Secondary right DataFrame.
        left_keys: List of key column names in left_df.
        right_keys: List of key column names in right_df.

    Returns:
        RelationshipType indicating join cardinality.
    """
    if not left_keys or not right_keys:
        return RelationshipType.CROSS

    # Check for duplicate non-null key combinations
    left_subset = left_df.dropna(subset=left_keys)
    right_subset = right_df.dropna(subset=right_keys)

    left_has_dups = bool(left_subset.duplicated(subset=left_keys).any())
    right_has_dups = bool(right_subset.duplicated(subset=right_keys).any())

    if not left_has_dups and not right_has_dups:
        return RelationshipType.ONE_TO_ONE
    if not left_has_dups and right_has_dups:
        return RelationshipType.ONE_TO_MANY
    if left_has_dups and not right_has_dups:
        return RelationshipType.MANY_TO_ONE
    return RelationshipType.MANY_TO_MANY


def analyze_merge(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    left_on: list[str] | str | None = None,
    right_on: list[str] | str | None = None,
    how: str | JoinType = JoinType.INNER,
    suffixes: tuple[str, str] = ("_left", "_right"),
    max_unmatched_samples: int = 5,
) -> dict[str, Any]:
    """Perform pre-merge diagnostics and calculate match statistics without executing the full join.

    Inspects cardinality, match percentages, potential Cartesian explosions,
    and column name collisions.

    Args:
        left_df: Primary left DataFrame.
        right_df: Secondary right DataFrame to join.
        left_on: Key column(s) in left_df.
        right_on: Key column(s) in right_df.
        how: Relational join type (inner, left, right, outer, cross).
        suffixes: Suffixes for overlapping column names.
        max_unmatched_samples: Maximum number of sample unmatched keys to return.

    Returns:
        Structured analysis report with match rates, warnings, and projected schema.

    Raises:
        MergeError: If specified keys do not exist or configuration is invalid.
    """
    how_str = how.value if hasattr(how, "value") else str(how).lower()
    valid_joins = {j.value for j in JoinType}
    if how_str not in valid_joins:
        raise MergeError(f"Unsupported join type: '{how_str}'. Must be one of: {sorted(valid_joins)}")

    left_keys, right_keys = validate_merge_keys(left_df, right_df, left_on, right_on, how_str)

    left_row_count = len(left_df)
    right_row_count = len(right_df)

    # Detect column collisions
    overlapping_cols = [
        c for c in left_df.columns if c in right_df.columns and (c not in left_keys or left_keys != right_keys)
    ]

    # Build projected resulting columns
    resulting_columns = []
    for c in left_df.columns:
        col_name = f"{c}{suffixes[0]}" if c in overlapping_cols else c
        resulting_columns.append({"name": col_name, "dtype": map_dtype(left_df[c].dtype)})
    for c in right_df.columns:
        if c in right_keys and left_keys == right_keys:
            continue
        col_name = f"{c}{suffixes[1]}" if c in overlapping_cols else c
        resulting_columns.append({"name": col_name, "dtype": map_dtype(right_df[c].dtype)})

    if how_str == JoinType.CROSS:
        estimated_rows = left_row_count * right_row_count
        return {
            "relationship": RelationshipType.CROSS.value,
            "left_row_count": left_row_count,
            "right_row_count": right_row_count,
            "matched_left_rows": left_row_count,
            "unmatched_left_rows": 0,
            "match_rate_left": 100.0 if left_row_count > 0 else 0.0,
            "matched_right_rows": right_row_count,
            "unmatched_right_rows": 0,
            "match_rate_right": 100.0 if right_row_count > 0 else 0.0,
            "estimated_output_rows": estimated_rows,
            "has_duplicate_left_keys": False,
            "has_duplicate_right_keys": False,
            "warning": (
                f"Cross join produces Cartesian product of {estimated_rows:,} rows."
                if estimated_rows > 100_000
                else None
            ),
            "column_conflicts": overlapping_cols,
            "resulting_columns": resulting_columns,
            "sample_unmatched_left_keys": [],
            "sample_unmatched_right_keys": [],
        }

    # Extract key series and compute match rates using shadow keys
    l_series = _build_shadow_keys(left_df, left_keys, "L")
    r_series = _build_shadow_keys(right_df, right_keys, "R")

    def _is_valid_key(val):
        if isinstance(val, tuple):
            return not any(isinstance(x, str) and x.startswith("__loom_null_") for x in val)
        return not (isinstance(val, str) and val.startswith("__loom_null_"))

    left_valid_mask = l_series.map(_is_valid_key)
    right_valid_mask = r_series.map(_is_valid_key)

    left_unique_keys = set(l_series[left_valid_mask].unique())
    right_unique_keys = set(r_series[right_valid_mask].unique())

    common_keys = left_unique_keys.intersection(right_unique_keys)

    # Matched row counts
    matched_left_mask = l_series.isin(common_keys)
    matched_right_mask = r_series.isin(common_keys)

    matched_left_count = int(matched_left_mask.sum())
    unmatched_left_count = left_row_count - matched_left_count
    match_rate_left = round((matched_left_count / left_row_count * 100.0), 2) if left_row_count > 0 else 0.0

    matched_right_count = int(matched_right_mask.sum())
    unmatched_right_count = right_row_count - matched_right_count
    match_rate_right = round((matched_right_count / right_row_count * 100.0), 2) if right_row_count > 0 else 0.0

    relationship = detect_relationship(left_df, right_df, left_keys, right_keys)
    has_dup_left = relationship in (RelationshipType.MANY_TO_ONE, RelationshipType.MANY_TO_MANY)
    has_dup_right = relationship in (RelationshipType.ONE_TO_MANY, RelationshipType.MANY_TO_MANY)

    # Estimate output rows based on key frequencies for common keys
    if len(common_keys) > 0:
        l_freq = l_series[matched_left_mask].value_counts()
        r_freq = r_series[matched_right_mask].value_counts()
        inner_matches = sum(int(l_freq[k]) * int(r_freq[k]) for k in common_keys)
    else:
        inner_matches = 0

    if how_str == JoinType.INNER:
        estimated_rows = inner_matches
    elif how_str == JoinType.LEFT:
        estimated_rows = inner_matches + unmatched_left_count
    elif how_str == JoinType.RIGHT:
        estimated_rows = inner_matches + unmatched_right_count
    elif how_str == JoinType.OUTER:
        estimated_rows = inner_matches + unmatched_left_count + unmatched_right_count
    else:
        estimated_rows = inner_matches

    # Sample unmatched keys for diagnostics (sampled from original dataframe columns)
    if len(left_keys) == 1:
        orig_l = left_df[left_keys[0]]
        unmatched_l_sample = [
            item for item in orig_l[~matched_left_mask & left_valid_mask].drop_duplicates().head(max_unmatched_samples)
        ]
    else:
        orig_l_tuples = list(zip(*(left_df[k] for k in left_keys), strict=False))
        orig_l = pd.Series(orig_l_tuples, index=left_df.index)
        unmatched_l_sample = [
            item for item in orig_l[~matched_left_mask & left_valid_mask].drop_duplicates().head(max_unmatched_samples)
        ]

    if len(right_keys) == 1:
        orig_r = right_df[right_keys[0]]
        unmatched_r_sample = [
            item
            for item in orig_r[~matched_right_mask & right_valid_mask].drop_duplicates().head(max_unmatched_samples)
        ]
    else:
        orig_r_tuples = list(zip(*(right_df[k] for k in right_keys), strict=False))
        orig_r = pd.Series(orig_r_tuples, index=right_df.index)
        unmatched_r_sample = [
            item
            for item in orig_r[~matched_right_mask & right_valid_mask].drop_duplicates().head(max_unmatched_samples)
        ]

    # Format sample keys for JSON serialization
    def _format_sample(k):
        if isinstance(k, tuple):
            return [None if pd.isna(x) else (x.item() if isinstance(x, np.generic) else x) for x in k]
        if pd.isna(k):
            return None
        return k.item() if isinstance(k, np.generic) else k

    warning = None
    if relationship == RelationshipType.MANY_TO_MANY:
        warning = (
            "Many-to-many join detected: duplicate keys exist in both datasets. "
            f"This may significantly multiply output rows (estimated {estimated_rows:,} rows)."
        )
    elif how_str == JoinType.INNER and match_rate_left < 50.0:
        warning = f"Low left match rate ({match_rate_left}%). Over half of left rows will be dropped in inner join."

    return {
        "relationship": relationship.value,
        "left_row_count": left_row_count,
        "right_row_count": right_row_count,
        "matched_left_rows": matched_left_count,
        "unmatched_left_rows": unmatched_left_count,
        "match_rate_left": match_rate_left,
        "matched_right_rows": matched_right_count,
        "unmatched_right_rows": unmatched_right_count,
        "match_rate_right": match_rate_right,
        "estimated_output_rows": estimated_rows,
        "has_duplicate_left_keys": has_dup_left,
        "has_duplicate_right_keys": has_dup_right,
        "warning": warning,
        "column_conflicts": overlapping_cols,
        "resulting_columns": resulting_columns,
        "sample_unmatched_left_keys": [_format_sample(k) for k in unmatched_l_sample],
        "sample_unmatched_right_keys": [_format_sample(k) for k in unmatched_r_sample],
    }


def merge_dataframes(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    left_on: list[str] | str | None = None,
    right_on: list[str] | str | None = None,
    how: str | JoinType = JoinType.INNER,
    suffixes: tuple[str, str] = ("_left", "_right"),
    max_rows_limit: int | None = 1_000_000,
) -> pd.DataFrame:
    """Execute a relational join between two DataFrames with type safety and Cartesian limits.

    Args:
        left_df: Primary left DataFrame.
        right_df: Secondary right DataFrame.
        left_on: Key column(s) in left_df.
        right_on: Key column(s) in right_df.
        how: Relational join type (inner, left, right, outer, cross).
        suffixes: Suffixes applied to overlapping column names.
        max_rows_limit: Maximum allowed rows in the output before raising a safety error.

    Returns:
        Joined DataFrame with reset RangeIndex and normalized string columns.

    Raises:
        MergeError: On missing keys, type incompatibility, or Cartesian explosion exceeding safety limits.
    """
    how_str = how.value if hasattr(how, "value") else str(how).lower()
    valid_joins = {j.value for j in JoinType}
    if how_str not in valid_joins:
        raise MergeError(f"Unsupported join type: '{how_str}'. Must be one of: {sorted(valid_joins)}")

    left_keys, right_keys = validate_merge_keys(left_df, right_df, left_on, right_on, how_str)

    # Pre-merge row limit check to prevent out-of-memory crashes on Cartesian explosions
    if max_rows_limit is not None and max_rows_limit > 0:
        if how_str in (JoinType.cross, JoinType.CROSS, "cross"):
            est_rows = len(left_df) * len(right_df)
            if est_rows > max_rows_limit:
                raise MergeError(
                    f"Cross join would produce {est_rows:,} rows, exceeding the safety limit of {max_rows_limit:,}."
                )
        else:
            analysis = analyze_merge(left_df, right_df, left_on=left_keys, right_on=right_keys, how=how_str)
            est_rows = analysis.get("estimated_output_rows", 0)
            if est_rows > max_rows_limit:
                raise MergeError(
                    f"Merge is estimated to produce {est_rows:,} rows, "
                    f"exceeding the safety ceiling of {max_rows_limit:,} rows. "
                    "Check for duplicate keys causing a Cartesian explosion."
                )

    if how_str in (JoinType.cross, JoinType.CROSS, "cross"):
        try:
            result = pd.merge(left_df, right_df, how="cross", suffixes=suffixes)
        except (ValueError, TypeError, MemoryError) as exc:
            raise MergeError(f"Failed to execute cross merge: {exc}") from exc
    else:
        left_m = left_df.copy()
        right_m = right_df.copy()
        left_m["__loom_shadow_L"] = _build_shadow_keys(left_df, left_keys, "L")
        right_m["__loom_shadow_R"] = _build_shadow_keys(right_df, right_keys, "R")

        try:
            result = pd.merge(
                left_m,
                right_m,
                how=how_str,
                left_on="__loom_shadow_L",
                right_on="__loom_shadow_R",
                suffixes=suffixes,
            )
        except (ValueError, TypeError, MemoryError) as exc:
            raise MergeError(f"Failed to execute {how_str} merge: {exc}") from exc

        result.drop(columns=["__loom_shadow_L", "__loom_shadow_R"], inplace=True)

        if left_keys == right_keys:
            for k in left_keys:
                c_l = f"{k}{suffixes[0]}"
                c_r = f"{k}{suffixes[1]}"
                if c_l in result.columns and c_r in result.columns:
                    result[k] = result[c_l].combine_first(result[c_r])
                    result.drop(columns=[c_l, c_r], inplace=True)
                    if k in left_df.columns:
                        cols = list(result.columns)
                        cols.remove(k)
                        orig_idx = min(list(left_df.columns).index(k), len(cols))
                        cols.insert(orig_idx, k)
                        result = result[cols]

    if max_rows_limit is not None and len(result) > max_rows_limit:
        raise MergeError(
            f"Merge produced {len(result):,} rows, exceeding the safety ceiling of {max_rows_limit:,} rows. "
            "Check for duplicate keys causing a Cartesian explosion."
        )

    result.columns = [str(c) for c in result.columns]
    result.columns.name = None
    return result.reset_index(drop=True)
