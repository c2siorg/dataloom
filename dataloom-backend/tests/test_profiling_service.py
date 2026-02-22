"""Unit tests for profiling service functions."""

import pytest
import pandas as pd
import numpy as np
from app.services.profiling_service import (
    classify_column,
    compute_dataset_summary,
    compute_numeric_stats,
    compute_categorical_stats,
    compute_column_profile,
    compute_profile,
)


@pytest.fixture
def sample_df():
    """Create a sample DataFrame with mixed column types."""
    return pd.DataFrame({
        "age": [25, 30, 35, 40, 45],
        "name": ["Alice", "Bob", "Charlie", "Alice", "Bob"],
        "active": [True, False, True, True, False],
        "joined": pd.to_datetime(["2020-01-01", "2021-06-15", "2022-03-10", "2023-01-01", "2024-05-20"]),
    })


class TestClassifyColumn:
    def test_numeric_int(self):
        assert classify_column(pd.Series([1, 2, 3])) == "numeric"

    def test_numeric_float(self):
        assert classify_column(pd.Series([1.0, 2.5, 3.7])) == "numeric"

    def test_boolean(self):
        assert classify_column(pd.Series([True, False, True])) == "boolean"

    def test_datetime(self):
        assert classify_column(pd.to_datetime(pd.Series(["2020-01-01", "2021-01-01"]))) == "datetime"

    def test_categorical_string(self):
        assert classify_column(pd.Series(["a", "b", "c"])) == "categorical"

    def test_boolean_over_numeric(self):
        """Boolean should be detected before numeric since bool is a subtype of int."""
        s = pd.Series([True, False, True], dtype="bool")
        assert classify_column(s) == "boolean"


class TestComputeDatasetSummary:
    def test_basic_summary(self, sample_df):
        result = compute_dataset_summary(sample_df)
        assert result.row_count == 5
        assert result.column_count == 4
        assert result.missing_count == 0
        assert result.memory_usage_bytes == int(sample_df.memory_usage(deep=True).sum())
        assert result.duplicate_row_count == 0

    def test_empty_dataframe(self):
        df = pd.DataFrame()
        result = compute_dataset_summary(df)
        assert result.row_count == 0
        assert result.column_count == 0
        assert result.missing_count == 0
        assert result.duplicate_row_count == 0

    def test_with_missing_values(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": [None, None, "x"]})
        result = compute_dataset_summary(df)
        assert result.missing_count == 3

    def test_with_duplicates(self):
        df = pd.DataFrame({"a": [1, 1, 2], "b": ["x", "x", "y"]})
        result = compute_dataset_summary(df)
        assert result.duplicate_row_count == 1


class TestComputeNumericStats:
    def test_basic_stats(self):
        s = pd.Series([10, 20, 30, 40, 50])
        result = compute_numeric_stats(s)
        assert result is not None
        assert result.mean == pytest.approx(30.0)
        assert result.median == pytest.approx(30.0)
        assert result.min == pytest.approx(10.0)
        assert result.max == pytest.approx(50.0)
        assert result.q1 == pytest.approx(s.quantile(0.25))
        assert result.q3 == pytest.approx(s.quantile(0.75))
        assert result.skewness == pytest.approx(s.skew())
        assert result.std == pytest.approx(s.std())

    def test_all_null_returns_none(self):
        s = pd.Series([None, None, None], dtype="float64")
        result = compute_numeric_stats(s)
        assert result is None

    def test_with_some_nulls(self):
        s = pd.Series([1.0, None, 3.0])
        result = compute_numeric_stats(s)
        assert result is not None
        assert result.mean == pytest.approx(2.0)


class TestComputeCategoricalStats:
    def test_basic_stats(self):
        s = pd.Series(["a", "b", "a", "c", "a", "b"])
        result = compute_categorical_stats(s)
        assert result is not None
        assert len(result.top_values) <= 5
        assert result.top_values[0].value == "a"
        assert result.top_values[0].count == 3
        assert result.mode == "a"

    def test_all_null_returns_none(self):
        s = pd.Series([None, None, None])
        result = compute_categorical_stats(s)
        assert result is None

    def test_top_values_limited_to_5(self):
        s = pd.Series(["a", "b", "c", "d", "e", "f", "g"])
        result = compute_categorical_stats(s)
        assert result is not None
        assert len(result.top_values) <= 5


class TestComputeColumnProfile:
    def test_numeric_column(self):
        s = pd.Series([1, 2, 3, None], name="val")
        result = compute_column_profile("val", s)
        assert result.name == "val"
        assert result.dtype == "numeric"
        assert result.missing_count == 1
        assert result.missing_percentage == pytest.approx(25.0)
        assert result.unique_count == 3
        assert result.numeric_stats is not None
        assert result.categorical_stats is None

    def test_categorical_column(self):
        s = pd.Series(["a", "b", "a"])
        result = compute_column_profile("cat", s)
        assert result.dtype == "categorical"
        assert result.categorical_stats is not None
        assert result.numeric_stats is None

    def test_empty_series(self):
        s = pd.Series([], dtype="float64")
        result = compute_column_profile("empty", s)
        assert result.missing_count == 0
        assert result.missing_percentage == 0.0


class TestComputeProfile:
    def test_full_profile(self, sample_df):
        result = compute_profile(sample_df)
        assert result.summary.row_count == 5
        assert result.summary.column_count == 4
        assert len(result.columns) == 4

    def test_empty_dataframe(self):
        df = pd.DataFrame()
        result = compute_profile(df)
        assert result.summary.row_count == 0
        assert len(result.columns) == 0

    def test_column_names_match(self, sample_df):
        result = compute_profile(sample_df)
        profile_names = [c.name for c in result.columns]
        assert profile_names == list(sample_df.columns)
