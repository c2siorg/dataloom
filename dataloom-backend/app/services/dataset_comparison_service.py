"""Read-only comparison of a project's working dataset and a checkpoint."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date, datetime
from numbers import Number
from typing import Any

import numpy as np
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
    row_page: int
    cell_page: int
    page_size: int
    total_row_pages: int
    total_cell_pages: int
    matching_strategy: str


def _is_missing_scalar(value: Any) -> bool:
    """Return whether a supported scalar is a pandas/NumPy missing value."""
    if isinstance(value, (list, dict, tuple, np.ndarray)):
        return False
    missing = pd.isna(value)
    return isinstance(missing, (bool, np.bool_)) and bool(missing)


def _json_value(value: Any) -> Any:
    """Normalize supported pandas/NumPy values into strict JSON values.

    Nested lists and string-keyed dictionaries are serialized structurally.
    Non-finite floats and arbitrary Python objects are rejected so an API
    response never depends on permissive JSON encoders.
    """
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("Comparison values must use string keys in JSON objects")
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_value(item) for item in value]

    if isinstance(value, np.generic):
        value = value.item()

    if _is_missing_scalar(value):
        return None
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Comparison values must be finite JSON numbers")
        return value
    if isinstance(value, (datetime, date, pd.Timestamp)):
        return value.isoformat()
    if isinstance(value, Number):
        # Decimal and other numeric implementations are normalized only when
        # they expose a native scalar representation.
        native = value.item() if hasattr(value, "item") else None
        if native is not None and native is not value:
            return _json_value(native)
    raise ValueError(f"Unsupported comparison value type: {type(value).__name__}")


def _equal(left: Any, right: Any) -> bool:
    """Compare supported scalar and nested JSON values deterministically."""
    left_missing = _is_missing_scalar(left)
    right_missing = _is_missing_scalar(right)
    if left_missing or right_missing:
        return left_missing and right_missing

    left_json = _json_value(left)
    right_json = _json_value(right)
    if isinstance(left_json, (bool, type(None))) or isinstance(right_json, (bool, type(None))):
        return type(left_json) is type(right_json) and left_json == right_json
    if isinstance(left_json, (int, float)) and isinstance(right_json, (int, float)):
        return left_json == right_json
    if type(left_json) is not type(right_json):
        return False
    if isinstance(left_json, list):
        return len(left_json) == len(right_json) and all(
            _equal(a, b) for a, b in zip(left_json, right_json, strict=True)
        )
    if isinstance(left_json, dict):
        return left_json.keys() == right_json.keys() and all(
            _equal(left_json[key], right_json[key]) for key in left_json
        )
    return left_json == right_json


def _row_key(value: Any) -> str:
    """Create a deterministic scalar key, normalizing equivalent numbers."""
    if isinstance(value, np.generic):
        value = value.item()
    if _is_missing_scalar(value):
        raise ValueError("Match-column values must be non-missing JSON scalars")
    if isinstance(value, (list, dict)) or value is None:
        raise ValueError("Match-column values must be non-missing JSON scalars")

    normalized = _json_value(value)
    if isinstance(normalized, bool):
        kind = "boolean"
    elif isinstance(normalized, (int, float)):
        kind = "number"
        if isinstance(normalized, float) and normalized.is_integer():
            normalized = int(normalized)
    elif isinstance(value, (datetime, date, pd.Timestamp)):
        kind = "datetime" if isinstance(value, (datetime, pd.Timestamp)) else "date"
    elif isinstance(normalized, str):
        kind = "string"
    else:
        raise ValueError("Match-column values must be non-missing JSON scalars")
    return json.dumps([kind, normalized], ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def compare_dataframes(
    checkpoint_df: pd.DataFrame,
    current_df: pd.DataFrame,
    *,
    row_page: int = 1,
    cell_page: int = 1,
    page_size: int = 50,
    match_column: str | None = None,
) -> ComparisonResult:
    """Compare two DataFrames without mutating either input.

    When ``match_column`` is supplied it must be present and unique in both
    frames. Otherwise rows are matched positionally and the response explicitly
    reports that weaker strategy.
    """
    if row_page < 1:
        raise ValueError("row_page must be >= 1")
    if cell_page < 1:
        raise ValueError("cell_page must be >= 1")
    if page_size < 1:
        raise ValueError("page_size must be >= 1")

    checkpoint_columns = list(checkpoint_df.columns)
    current_columns = list(current_df.columns)
    if len(set(checkpoint_columns)) != len(checkpoint_columns) or len(set(current_columns)) != len(current_columns):
        raise ValueError("Duplicate dataset column names are not supported for comparison")
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
        strategy = f"identifier:{match_column}"
        checkpoint_positions: dict[str, int] = {}
        current_positions: dict[str, int] = {}
        checkpoint_match_values = checkpoint_df[match_column].to_numpy()
        current_match_values = current_df[match_column].to_numpy()
        for positions, values in (
            (checkpoint_positions, checkpoint_match_values),
            (current_positions, current_match_values),
        ):
            for index, value in enumerate(values):
                key = _row_key(value)
                if key in positions:
                    raise ValueError(f"Match column '{match_column}' must contain unique values in both datasets")
                positions[key] = index
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
                    "row": _json_value(checkpoint_match_values[checkpoint_positions[key]]),
                    "checkpoint_index": int(checkpoint_positions[key]),
                    "current_index": None,
                }
            )
        for key in added_keys:
            row_changes.append(
                {
                    "type": "added",
                    "row": _json_value(current_match_values[current_positions[key]]),
                    "checkpoint_index": None,
                    "current_index": int(current_positions[key]),
                }
            )
        pairs = [
            (
                checkpoint_positions[key],
                current_positions[key],
                _json_value(current_match_values[current_positions[key]]),
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

    # Convert each DataFrame to column arrays once.
    checkpoint_values = {column: checkpoint_df[column].to_numpy() for column in common_columns}
    current_values = {column: current_df[column].to_numpy() for column in common_columns}

    for checkpoint_index, current_index, row_identifier in pairs:
        for column in common_columns:
            before = checkpoint_values[column][checkpoint_index]
            after = current_values[column][current_index]

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

    total_row_pages = max(1, (total_row_changes + page_size - 1) // page_size)
    total_cell_pages = max(1, (total_cell_changes + page_size - 1) // page_size)
    row_start = (row_page - 1) * page_size
    row_end = row_start + page_size
    cell_start = (cell_page - 1) * page_size
    cell_end = cell_start + page_size

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
        rows=row_changes[row_start:row_end],
        cells=cell_changes[cell_start:cell_end],
        total_rows=total_row_changes,
        total_cells=total_cell_changes,
        row_page=row_page,
        cell_page=cell_page,
        page_size=page_size,
        total_row_pages=total_row_pages,
        total_cell_pages=total_cell_pages,
        matching_strategy=strategy,
    )
