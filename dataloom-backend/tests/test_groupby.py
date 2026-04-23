"""Tests for the groupby aggregation transformation."""

import pandas as pd
import pytest

from app.services.transformation_service import TransformationError, group_by


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "department": ["Engineering", "Engineering", "Sales", "Sales", "Marketing"],
            "employee": ["Alice", "Bob", "Charlie", "Diana", "Eve"],
            "salary": [95000, 85000, 70000, 75000, 65000],
            "age": [30, 25, 35, 28, 32],
        }
    )


class TestGroupBy:
    def test_sum(self, sample_df):
        result = group_by(sample_df, ["department"], "salary", "sum")
        eng = result[result["department"] == "Engineering"]["salary"].iloc[0]
        assert eng == 180000

    def test_mean(self, sample_df):
        result = group_by(sample_df, ["department"], "age", "mean")
        eng = result[result["department"] == "Engineering"]["age"].iloc[0]
        assert eng == 27.5

    def test_count(self, sample_df):
        result = group_by(sample_df, ["department"], "salary", "count")
        eng = result[result["department"] == "Engineering"]["salary"].iloc[0]
        assert eng == 2

    def test_min(self, sample_df):
        result = group_by(sample_df, ["department"], "salary", "min")
        sales = result[result["department"] == "Sales"]["salary"].iloc[0]
        assert sales == 70000

    def test_max(self, sample_df):
        result = group_by(sample_df, ["department"], "salary", "max")
        sales = result[result["department"] == "Sales"]["salary"].iloc[0]
        assert sales == 75000

    def test_median(self, sample_df):
        result = group_by(sample_df, ["department"], "age", "median")
        eng = result[result["department"] == "Engineering"]["age"].iloc[0]
        assert eng == 27.5

    def test_multiple_group_columns(self, sample_df):
        result = group_by(sample_df, ["department", "age"], "salary", "sum")
        assert len(result) == 5  # each row is unique by dept+age

    def test_flat_output(self, sample_df):
        result = group_by(sample_df, ["department"], "salary", "sum")
        assert isinstance(result.columns.tolist()[0], str)
        assert "department" in result.columns

    def test_invalid_column(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            group_by(sample_df, ["nonexistent"], "salary", "sum")

    def test_invalid_agg_column(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            group_by(sample_df, ["department"], "nonexistent", "sum")

    def test_invalid_function(self, sample_df):
        with pytest.raises(TransformationError, match="Unsupported"):
            group_by(sample_df, ["department"], "salary", "invalid_func")
