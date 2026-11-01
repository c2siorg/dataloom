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

    def test_float_group_keys_are_not_rounded(self):
        df = pd.DataFrame({"price": [1.231, 1.234, 1.234, 2.5], "qty": [10, 20, 30, 40]})
        result = group_by(df, ["price"], "qty", "sum")
        assert list(result["price"]) == [1.231, 1.234, 2.5]
        assert list(result["qty"]) == [10, 50, 40]

    def test_aggregated_values_are_still_rounded(self):
        df = pd.DataFrame({"grp": ["a", "a"], "val": [1.111, 2.222]})
        result = group_by(df, ["grp"], "val", "mean")
        assert result["val"].iloc[0] == 1.67

    def test_invalid_function(self, sample_df):
        with pytest.raises(TransformationError, match="Unsupported"):
            group_by(sample_df, ["department"], "salary", "invalid_func")

    def test_empty_columns(self, sample_df):
        with pytest.raises(TransformationError, match="At least one group-by column is required"):
            group_by(sample_df, [], "salary", "sum")

    def test_agg_column_that_is_also_a_group_column(self, sample_df):
        with pytest.raises(TransformationError, match="group-by column"):
            group_by(sample_df, ["department"], "department", "count")

    def test_non_numeric_aggregation(self, sample_df):
        with pytest.raises(TransformationError, match="Cannot aggregate column"):
            group_by(sample_df, ["department"], "employee", "mean")

    def test_non_numeric_aggregation_median(self, sample_df):
        with pytest.raises(TransformationError, match="Cannot aggregate column"):
            group_by(sample_df, ["department"], "employee", "median")

    def test_valid_string_count_aggregation(self, sample_df):
        result = group_by(sample_df, ["department"], "employee", "count")
        eng = result[result["department"] == "Engineering"]["employee"].iloc[0]
        assert eng == 2
