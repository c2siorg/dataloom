"""Read-only comparison of a project's working dataset and a checkpoint."""

from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass
from typing import Any

import pandas as pd


@dataclass(frozen=True)
class ComparisonResult:
    """Normalized comparison result suitable for API serialization."""

    summary: dict[str, int]
    columns: dict[str, Any]
    rows: list[dict[str, Any]]
    cells: list[dict[str, Any]]
    total_rows: int
    total_cells: int
    page: int
    page_size: int
    total_pages: int
    matching_strategy: str


def _equal(left: Any, right: Any) -> bool:
    """Compare scalar values without treating missing values as different."""
    left_missing = pd.isna(left)
    right_missing = pd.isna(right)
    if isinstance(left_missing, bool) and isinstance(right_missing, bool) and left_missing and right_missing:
        return True
    try:
        result = left == right
        if hasattr(result, "item"):
            result = result.item()
        return bool(result)
    except (TypeError, ValueError):
        return str(left) == str(right)


def _json_value(value: Any) -> Any:
    """Convert pandas/numpy scalar values into JSON-safe values."""
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        with suppress(TypeError, ValueError):
            value = value.item()
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def _row_key(value: Any) -> str:
    """Create a deterministic string key for identifier-based matching."""
    value = _json_value(value)
    return repr(value)


def compare_dataframes(
    checkpoint_df: pd.DataFrame,
    current_df: pd.DataFrame,
    *,
    page: int = 1,
    page_size: int = 50,
    match_column: str | None = None,
) -> ComparisonResult:
    """Compare two DataFrames without mutating either input.

    When ``match_column`` is supplied it must be present and unique in both
    frames. Otherwise rows are matched positionally and the response explicitly
    reports that weaker strategy.
    """
    if page < 1:
        raise ValueError("page must be >= 1")
    if page_size < 1:
        raise ValueError("page_size must be >= 1")

    checkpoint_columns = list(checkpoint_df.columns)
    current_columns = list(current_df.columns)
    checkpoint_set = set(checkpoint_columns)
    current_set = set(current_columns)
    common_columns = [c for c in current_columns if c in checkpoint_set]

    added_columns = [c for c in current_columns if c not in checkpoint_set]
    removed_columns = [c for c in checkpoint_columns if c not in current_set]
    dtype_changed = [
        {
            "name": column,
            "before": str(checkpoint_df[column].dtype),
            "after": str(current_df[column].dtype),
        }
        for column in common_columns
        if str(checkpoint_df[column].dtype) != str(current_df[column].dtype)
    ]

    if match_column is not None:
        if match_column not in common_columns:
            raise ValueError(f"Match column '{match_column}' is not present in both datasets")
        if checkpoint_df[match_column].duplicated().any() or current_df[match_column].duplicated().any():
            raise ValueError(f"Match column '{match_column}' must contain unique values in both datasets")
        strategy = f"identifier:{match_column}"
        checkpoint_positions = {_row_key(value): index for index, value in checkpoint_df[match_column].items()}
        current_positions = {_row_key(value): index for index, value in current_df[match_column].items()}
        checkpoint_keys = list(checkpoint_positions)
        current_keys = list(current_positions)
        removed_keys = [key for key in checkpoint_keys if key not in current_positions]
        added_keys = [key for key in current_keys if key not in checkpoint_positions]
        matched_keys = [key for key in current_keys if key in checkpoint_positions]
        row_changes = []
        for key in removed_keys:
            row_changes.append(
                {
                    "type": "removed",
                    "row": _json_value(checkpoint_df.loc[checkpoint_positions[key], match_column]),
                    "checkpoint_index": int(checkpoint_positions[key]),
                    "current_index": None,
                }
            )
        for key in added_keys:
            row_changes.append(
                {
                    "type": "added",
                    "row": _json_value(current_df.loc[current_positions[key], match_column]),
                    "checkpoint_index": None,
                    "current_index": int(current_positions[key]),
                }
            )
        pairs = [
            (
                checkpoint_positions[key],
                current_positions[key],
                _json_value(current_df.loc[current_positions[key], match_column]),
            )
            for key in matched_keys
        ]
    else:
        strategy = "positional"
        common_length = min(len(checkpoint_df), len(current_df))
        removed_keys = list(range(common_length, len(checkpoint_df)))
        added_keys = list(range(common_length, len(current_df)))
        row_changes = [
            {
                "type": "removed",
                "row": int(index),
                "checkpoint_index": int(index),
                "current_index": None,
            }
            for index in removed_keys
        ] + [
            {
                "type": "added",
                "row": int(index),
                "checkpoint_index": None,
                "current_index": int(index),
            }
            for index in added_keys
        ]
        pairs = [(index, index, int(index)) for index in range(common_length)]

    cell_changes: list[dict[str, Any]] = []
    affected_rows: set[Any] = set()
    affected_columns: set[str] = set()

    for checkpoint_index, current_index, row_identifier in pairs:
        for column in common_columns:
            before = checkpoint_df.iloc[checkpoint_index][column]
            after = current_df.iloc[current_index][column]
            if not _equal(before, after):
                cell_changes.append(
                    {
                        "row": row_identifier,
                        "column": column,
                        "checkpoint_value": _json_value(before),
                        "current_value": _json_value(after),
                    }
                )
                affected_rows.add(row_identifier)
                affected_columns.add(column)

    total_row_changes = len(row_changes)
    total_cell_changes = len(cell_changes)
    total_items = max(total_row_changes, total_cell_changes)
    total_pages = max(1, (total_items + page_size - 1) // page_size)

    start = (page - 1) * page_size
    end = start + page_size

    return ComparisonResult(
        summary={
            "checkpoint_rows": len(checkpoint_df),
            "current_rows": len(current_df),
            "checkpoint_columns": len(checkpoint_df.columns),
            "current_columns": len(current_df.columns),
            "added_rows": len(added_keys),
            "removed_rows": len(removed_keys),
            "changed_cells": total_cell_changes,
            "affected_rows": len(affected_rows),
            "affected_columns": len(affected_columns),
        },
        columns={
            "added": added_columns,
            "removed": removed_columns,
            "dtype_changed": dtype_changed,
        },
        rows=row_changes[start:end],
        cells=cell_changes[start:end],
        total_rows=total_row_changes,
        total_cells=total_cell_changes,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        matching_strategy=strategy,
    )
