"""Unit tests for transformation service functions."""

import pandas as pd
import pytest

from app.services.transformation_service import (
    TransformationError,
    add_column,
    add_row,
    advanced_query,
    apply_filter,
    apply_sort,
    change_cell_value,
    delete_column,
    delete_row,
    drop_duplicates,
    fill_empty,
    pivot_table,
)


@pytest.fixture
def sample_df():
    """Create a sample DataFrame for transformation tests."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [30, 25, 35],
            "city": ["New York", "Los Angeles", "Chicago"],
        }
    )


class TestFilter:
    def test_filter_equals_string(self, sample_df):
        result = apply_filter(sample_df, "name", "=", "Alice")
        assert len(result) == 1
        assert result.iloc[0]["name"] == "Alice"

    def test_filter_greater_than_numeric(self, sample_df):
        result = apply_filter(sample_df, "age", ">", "28")
        assert len(result) == 2

    def test_filter_less_than(self, sample_df):
        result = apply_filter(sample_df, "age", "<", "30")
        assert len(result) == 1

    def test_filter_invalid_column(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            apply_filter(sample_df, "nonexistent", "=", "value")

    def test_filter_not_equal(self, sample_df):
        result = apply_filter(sample_df, "name", "!=", "Alice")
        assert len(result) == 2
        assert "Alice" not in result["name"].values

    def test_filter_contains(self, sample_df):
        result = apply_filter(sample_df, "name", "contains", "li")
        assert len(result) == 2  # Alice and Charlie
        assert "Bob" not in result["name"].values

    def test_filter_invalid_condition(self, sample_df):
        with pytest.raises(TransformationError, match="Unsupported"):
            apply_filter(sample_df, "name", "invalid", "Alice")


class TestSort:
    def test_sort_ascending(self, sample_df):
        result = apply_sort(sample_df, "age", True)
        assert result.iloc[0]["age"] == 25

    def test_sort_descending(self, sample_df):
        result = apply_sort(sample_df, "age", False)
        assert result.iloc[0]["age"] == 35

    def test_sort_invalid_column(self, sample_df):
        with pytest.raises(TransformationError):
            apply_sort(sample_df, "nonexistent", True)


class TestAddRow:
    def test_add_row_at_beginning(self, sample_df):
        result = add_row(sample_df, 0)
        assert len(result) == 4
        assert result.iloc[0]["name"] == " "

    def test_add_row_at_end(self, sample_df):
        result = add_row(sample_df, 3)
        assert len(result) == 4

    def test_add_row_out_of_range(self, sample_df):
        with pytest.raises(TransformationError):
            add_row(sample_df, -1)


class TestDeleteRow:
    def test_delete_row(self, sample_df):
        result = delete_row(sample_df, 1)
        assert len(result) == 2
        assert "Bob" not in result["name"].values

    def test_delete_row_out_of_range(self, sample_df):
        with pytest.raises(TransformationError):
            delete_row(sample_df, 10)


class TestAddColumn:
    def test_add_column(self, sample_df):
        result = add_column(sample_df, 1, "email")
        assert "email" in result.columns
        assert list(result.columns).index("email") == 1

    def test_add_column_out_of_range(self, sample_df):
        with pytest.raises(TransformationError):
            add_column(sample_df, -1, "test")


class TestDeleteColumn:
    def test_delete_column(self, sample_df):
        result = delete_column(sample_df, 1)
        assert "age" not in result.columns

    def test_delete_column_out_of_range(self, sample_df):
        with pytest.raises(TransformationError):
            delete_column(sample_df, 10)


class TestChangeCellValue:
    def test_change_cell(self, sample_df):
        result = change_cell_value(sample_df, 0, 1, "Alice Updated")
        assert result.iloc[0]["name"] == "Alice Updated"


class TestFillEmpty:
    def test_fill_all_columns(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": [None, 5, None]})
        result = fill_empty(df, 0)
        assert result["a"].tolist() == [1.0, 0, 3.0]
        assert result["b"].tolist() == [0, 5.0, 0]

    def test_fill_specific_column(self):
        df = pd.DataFrame({"a": [1, None, 3], "b": [None, 5, None]})
        result = fill_empty(df, 0, column_index=0)
        assert result["a"].tolist() == [1.0, 0, 3.0]
        assert pd.isna(result["b"].iloc[0])


class TestDropDuplicates:
    def test_drop_duplicates(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", "Bob", "Alice"],
                "age": [30, 25, 30],
            }
        )
        result = drop_duplicates(df, "name", "first")
        assert len(result) == 2

    def test_drop_duplicates_missing_column(self, sample_df):
        with pytest.raises(TransformationError):
            drop_duplicates(sample_df, "nonexistent", "first")


class TestAdvancedQuery:
    def test_simple_query(self, sample_df):
        result = advanced_query(sample_df, "age > 28")
        assert len(result) == 2

    def test_injection_blocked(self, sample_df):
        from fastapi import HTTPException

        with pytest.raises(HTTPException):
            advanced_query(sample_df, "__import__('os').system('ls')")


class TestPivotTable:
    def test_simple_pivot(self):
        df = pd.DataFrame(
            {
                "city": ["NY", "LA", "NY", "LA"],
                "product": ["A", "A", "B", "B"],
                "sales": [100, 200, 150, 250],
            }
        )
        result = pivot_table(df, "city", "sales", aggfunc="sum")
        assert "city" in result.columns
        assert "sales" in result.columns
