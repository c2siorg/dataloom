"""Replay of mergeDataset logs must apply the max_rows_limit recorded at commit time."""

from __future__ import annotations

import pandas as pd
import pytest

from app.schemas import MAX_MERGE_ROWS_LIMIT, OperationType
from app.services.merge_service import MergeError
from app.services.transformation_service import TRANSFORMATION_REGISTRY, apply_merge_dataset


@pytest.fixture
def left_df():
    return pd.DataFrame({"cust_id": [1, 2, 3, 4], "name": ["Alice", "Bob", "Charlie", "Diana"]})


@pytest.fixture
def right_file(tmp_path):
    path = tmp_path / "orders.csv"
    pd.DataFrame({"cust_id": [1, 2, 3, 4], "total": [10, 20, 30, 40]}).to_csv(path, index=False)
    return str(path)


def test_recorded_limit_is_forwarded_to_merge_dataframes(monkeypatch, left_df, right_file):
    """A logged max_rows_limit is passed through to merge_dataframes on replay."""
    calls = []
    monkeypatch.setattr(
        "app.services.merge_service.merge_dataframes",
        lambda *args, **kwargs: calls.append(kwargs) or left_df,
    )

    apply_merge_dataset(left_df, right_file, left_on=["cust_id"], right_on=["cust_id"], how="inner", max_rows_limit=25)

    assert calls[0]["max_rows_limit"] == 25


def test_missing_limit_falls_back_to_default(monkeypatch, left_df, right_file):
    """Historical logs without max_rows_limit replay with the default limit."""
    calls = []
    monkeypatch.setattr(
        "app.services.merge_service.merge_dataframes",
        lambda *args, **kwargs: calls.append(kwargs) or left_df,
    )

    apply_merge_dataset(left_df, right_file, left_on=["cust_id"], right_on=["cust_id"], how="inner")

    assert calls[0]["max_rows_limit"] == MAX_MERGE_ROWS_LIMIT


def test_registry_extracts_limit_from_action_details():
    """build_args maps the logged max_rows_limit to the apply_merge_dataset argument."""
    spec = TRANSFORMATION_REGISTRY[OperationType.mergeDataset]

    args = spec.build_args({"file_path": "p", "left_on": ["k"], "right_on": ["k"], "how": "inner", "max_rows_limit": 7})
    assert args[-1] == 7

    legacy = spec.build_args({"file_path": "p", "left_on": ["k"], "right_on": ["k"], "how": "inner"})
    assert legacy[-1] is None


def test_replay_enforces_recorded_limit(left_df, right_file):
    """Replay raises when the result exceeds the recorded limit, even though it is under the default."""
    with pytest.raises(MergeError, match="exceeding the safety ceiling of 3"):
        apply_merge_dataset(
            left_df, right_file, left_on=["cust_id"], right_on=["cust_id"], how="inner", max_rows_limit=3
        )


def test_replay_without_limit_uses_default_and_succeeds(left_df, right_file):
    """The same merge passes when no limit was recorded (default applies)."""
    result = apply_merge_dataset(left_df, right_file, left_on=["cust_id"], right_on=["cust_id"], how="inner")

    assert len(result) == 4
