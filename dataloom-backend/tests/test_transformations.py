"""Unit tests for transformation service functions."""

import pandas as pd
import pytest

from app.services.transformation_service import (
    TransformationError,
    add_column,
    add_row,
    advanced_query,
    apply_filter,
    apply_logged_transformation,
    apply_sort,
    cast_data_type,
    change_cell_value,
    delete_column,
    delete_row,
    drop_duplicates,
    drop_na,
    fill_empty,
    pivot_table,
    rename_column,
    trim_whitespace,
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
    def test_filter_equals_string_case_insensitive(self, sample_df):
        df = pd.DataFrame({"Payment_Type": ["Cash", "CASH", "cash", "CARD"]})
        result = apply_filter(df, "Payment_Type", "=", "cash")
        assert len(result) == 3  # Should match Cash, CASH, cash

    def test_filter_equals_numeric_unchanged(self, sample_df):
        result = apply_filter(sample_df, "age", "=", "30")
        assert len(result) == 1
        assert result.iloc[0]["name"] == "Alice"

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

    def test_filter_contains_literal_metacharacters(self):
        """contains should match values with regex metacharacters literally, not crash."""
        df = pd.DataFrame({"c": ["price (USD)", "plain"]})
        result = apply_filter(df, "c", "contains", "(")
        assert len(result) == 1
        assert result.iloc[0]["c"] == "price (USD)"

    def test_filter_contains_dot_is_literal(self):
        """A '.' in the search value should match a literal dot, not any character."""
        df = pd.DataFrame({"c": ["a.b", "axb", "a+b"]})
        result = apply_filter(df, "c", "contains", "a.b")
        assert len(result) == 1
        assert result.iloc[0]["c"] == "a.b"

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

    def test_multi_column_sort(self, sample_df):
        """Multi-column sort should sort by multiple criteria in order."""
        criteria = [
            {"column": "age", "ascending": True},
            {"column": "name", "ascending": False},
        ]
        result = apply_sort(sample_df, criteria=criteria)
        # Verify actual row order — age ascending: Bob(25), Alice(30), Charlie(35)
        assert list(result["age"]) == [25, 30, 35]
        assert list(result["name"]) == ["Bob", "Alice", "Charlie"]
        assert list(result.columns) == list(sample_df.columns)
        assert len(result) == len(sample_df)

    def test_multi_column_sort_empty_criteria(self, sample_df):
        """Empty criteria list should raise TransformationError."""
        with pytest.raises(TransformationError, match="At least one sort criterion is required"):
            apply_sort(sample_df, criteria=[])

    def test_multi_column_sort_missing_column(self, sample_df):
        """Missing column in criteria should raise TransformationError."""
        with pytest.raises(TransformationError, match="Column name is required"):
            apply_sort(sample_df, criteria=[{"column": "", "ascending": True}])

    def test_multi_column_sort_invalid_column(self, sample_df):
        """Invalid column name should raise TransformationError."""
        with pytest.raises(TransformationError, match="not found"):
            apply_sort(sample_df, criteria=[{"column": "nonexistent", "ascending": True}])


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


class TestApplyLoggedTransformationFilterSort:
    """Replay must cover filter and sort — both are logged by the transform endpoint
    and must replay cleanly during revert. Regression: revert previously raised
    "Unknown action type in log replay: filter"."""

    def test_filter_replay_matches_apply_filter(self, sample_df):
        details = {"parameters": {"column": "age", "condition": ">=", "value": "28"}}
        replayed = apply_logged_transformation(sample_df, "filter", details)
        direct = apply_filter(sample_df, "age", ">=", "28")
        pd.testing.assert_frame_equal(replayed, direct)

    def test_sort_replay_matches_apply_sort(self, sample_df):
        details = {"sort_params": {"column": "age", "ascending": False}}
        replayed = apply_logged_transformation(sample_df, "sort", details)
        direct = apply_sort(sample_df, "age", False)
        pd.testing.assert_frame_equal(replayed, direct)


class TestApplyLoggedTransformationDelRow:
    """Replay must match live delete_row (RangeIndex) for save/checkpoint consistency."""

    def test_del_row_replay_matches_delete_row(self, sample_df):
        details = {"row_params": {"index": 1}}
        replayed = apply_logged_transformation(sample_df, "delRow", details)
        direct = delete_row(sample_df, 1)
        pd.testing.assert_frame_equal(replayed, direct)
        assert replayed.index.equals(pd.RangeIndex(len(replayed)))

    def test_del_row_replay_out_of_range(self, sample_df):
        with pytest.raises(TransformationError):
            apply_logged_transformation(sample_df, "delRow", {"row_params": {"index": 99}})

    def test_chained_del_row_replay_keeps_range_index(self, sample_df):
        df = apply_logged_transformation(sample_df, "delRow", {"row_params": {"index": 2}})
        df = apply_logged_transformation(df, "delRow", {"row_params": {"index": 0}})
        assert len(df) == 1
        assert df.index.equals(pd.RangeIndex(1))
        assert df.iloc[0]["name"] == "Bob"


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

    # out-of-bounds indices — col_index is 1-based, row_index 0-based
    def test_negative_row_index_raises(self, sample_df):
        with pytest.raises(TransformationError, match="out of bounds"):
            change_cell_value(sample_df, -1, 1, "x")

    def test_negative_col_index_raises(self, sample_df):
        # col_index < 1 must be rejected, not silently wrap to the last column.
        with pytest.raises(TransformationError, match="out of bounds"):
            change_cell_value(sample_df, 0, 0, "x")

    def test_row_index_past_end_raises(self, sample_df):
        with pytest.raises(TransformationError, match="out of bounds"):
            change_cell_value(sample_df, len(sample_df), 1, "x")

    def test_col_index_past_end_raises(self, sample_df):
        with pytest.raises(TransformationError, match="out of bounds"):
            change_cell_value(sample_df, 0, len(sample_df.columns) + 1, "x")

    # int column — frontend always sends strings
    def test_int_cell_with_numeric_string_preserves_dtype(self, sample_df):
        result = change_cell_value(sample_df, 0, 2, "31")
        assert result.iloc[0]["age"] == 31
        assert pd.api.types.is_integer_dtype(result["age"].dtype)

    def test_int_cell_with_fractional_string_truncates(self, sample_df):
        # Documented behavior: int columns silently truncate fractional input.
        result = change_cell_value(sample_df, 0, 2, "31.7")
        assert result.iloc[0]["age"] == 31
        assert pd.api.types.is_integer_dtype(result["age"].dtype)

    def test_int_cell_preserves_precision_for_large_integer_string(self, sample_df):
        # 2^53 + 1 cannot be represented exactly as a float64, so a naive
        # int(float(...)) would lose the trailing bit. int() handles it.
        result = change_cell_value(sample_df, 0, 2, "9007199254740993")
        assert result.iloc[0]["age"] == 9007199254740993
        assert pd.api.types.is_integer_dtype(result["age"].dtype)

    def test_int_cell_with_overflowing_exponent_upcasts_column(self, sample_df):
        # int(float("1e500")) raises OverflowError (float is inf); should
        # upcast to object instead of bubbling up as a 500.
        result = change_cell_value(sample_df, 0, 2, "1e500")
        assert result["age"].dtype == object
        assert result.iloc[0]["age"] == "1e500"

    def test_int_cell_with_non_numeric_string_upcasts_column(self, sample_df):
        result = change_cell_value(sample_df, 0, 2, "hello")
        assert result.iloc[0]["age"] == "hello"
        assert result["age"].dtype == object

    # float column
    def test_float_cell_with_decimal_string(self):
        df = pd.DataFrame({"name": ["A", "B"], "score": [1.0, 2.0]})
        result = change_cell_value(df, 0, 2, "3.14")
        assert result.iloc[0]["score"] == pytest.approx(3.14)
        assert pd.api.types.is_float_dtype(result["score"].dtype)

    # bool column — explicit truthy/falsy matrix, raise on unknown
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("true", True),
            ("True", True),
            ("1", True),
            ("yes", True),
            ("t", True),
            ("y", True),
            ("on", True),
            ("false", False),
            ("False", False),
            ("0", False),
            ("no", False),
            ("f", False),
            ("n", False),
            ("off", False),
        ],
    )
    def test_bool_cell_truthy_falsy_matrix(self, raw, expected):
        df = pd.DataFrame({"name": ["A"], "active": [True]})
        result = change_cell_value(df, 0, 2, raw)
        # pandas stores booleans as np.bool_; compare by value, not identity.
        assert bool(result.iloc[0]["active"]) == expected
        assert pd.api.types.is_bool_dtype(result["active"].dtype)

    def test_bool_cell_rejects_unknown_token(self):
        df = pd.DataFrame({"name": ["A"], "active": [True]})
        with pytest.raises(TransformationError, match="as boolean"):
            change_cell_value(df, 0, 2, "foo")

    # empty-string clears numeric cell and upcasts the column
    def test_clear_numeric_cell_stores_none(self, sample_df):
        result = change_cell_value(sample_df, 0, 2, "")
        assert result.iloc[0]["age"] is None
        # column was upcast to object so None can coexist with remaining ints
        assert result["age"].dtype == object


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

    def test_fill_custom_requires_value(self):
        # Custom strategy must keep the existing API explicit when no fill value is provided.
        df = pd.DataFrame({"a": [1, None, 3]})
        with pytest.raises(TransformationError, match="fill value is required"):
            fill_empty(df, strategy="custom")

    def test_fill_mean_for_numeric_column(self):
        # Mean strategy fills NaN with the numeric column average: (10 + 30) / 2 = 20.
        df = pd.DataFrame({"score": [10, None, 30]})
        result = fill_empty(df, column_index=0, strategy="mean")
        assert result["score"].tolist() == [10.0, 20.0, 30.0]

    def test_fill_median_for_numeric_column(self):
        # Median strategy fills NaN with the middle value of the non-empty values.
        df = pd.DataFrame({"score": [10, None, 50]})
        result = fill_empty(df, column_index=0, strategy="median")
        assert result["score"].tolist() == [10.0, 30.0, 50.0]

    def test_fill_mode_for_string_column(self):
        # Mode strategy supports categorical/string columns by using the most frequent value.
        df = pd.DataFrame({"city": ["Delhi", None, "Delhi", "Mumbai"]})
        result = fill_empty(df, column_index=0, strategy="mode")
        assert result["city"].tolist() == ["Delhi", "Delhi", "Delhi", "Mumbai"]

    def test_fill_forward_fill_specific_column(self):
        # Forward fill propagates the last valid value downward within the selected column.
        df = pd.DataFrame({"a": [1, None, None, 4], "b": [None, 2, None, 5]})
        result = fill_empty(df, column_index=0, strategy="ffill")
        assert result["a"].tolist() == [1.0, 1.0, 1.0, 4.0]
        assert pd.isna(result["b"].iloc[0])  # column b untouched

    def test_fill_backward_fill_specific_column(self):
        # Backward fill propagates the next valid value upward within the selected column.
        df = pd.DataFrame({"a": [None, None, 3, 4], "b": [None, 2, None, 5]})
        result = fill_empty(df, column_index=0, strategy="bfill")
        assert result["a"].tolist() == [3.0, 3.0, 3.0, 4.0]
        assert pd.isna(result["b"].iloc[0])  # column b untouched

    def test_fill_forward_fill_all_columns(self):
        # All-column forward fill is supported because it does not need per-column statistics.
        df = pd.DataFrame({"a": [1, None, 3], "b": [None, 5, None]})
        result = fill_empty(df, strategy="ffill")
        assert result["a"].tolist() == [1.0, 1.0, 3.0]
        assert pd.isna(result["b"].iloc[0])
        assert result["b"].tolist()[1:] == [5.0, 5.0]

    def test_fill_backward_fill_all_columns(self):
        # All-column backward fill is supported because it does not need per-column statistics.
        df = pd.DataFrame({"a": [1, None, 3], "b": [None, 5, None]})
        result = fill_empty(df, strategy="bfill")
        assert result["a"].tolist() == [1.0, 3.0, 3.0]
        assert result["b"].iloc[0] == 5.0
        assert pd.isna(result["b"].iloc[2])

    def test_fill_mean_non_numeric_column_raises(self):
        # Mean requires numeric data and should fail clearly for string columns.
        df = pd.DataFrame({"name": ["Alice", None, "Bob"]})
        with pytest.raises(TransformationError, match="Cannot compute mean on non-numeric column"):
            fill_empty(df, column_index=0, strategy="mean")

    def test_fill_median_non_numeric_column_raises(self):
        # Median requires numeric data and should fail clearly for string columns.
        df = pd.DataFrame({"name": ["Alice", None, "Bob"]})
        with pytest.raises(TransformationError, match="Cannot compute median on non-numeric column"):
            fill_empty(df, column_index=0, strategy="median")

    def test_fill_statistical_strategy_requires_specific_column(self):
        # Statistical strategies need one selected column so the computed value is unambiguous.
        df = pd.DataFrame({"a": [1, None, 3]})
        with pytest.raises(TransformationError, match="requires a specific column"):
            fill_empty(df, strategy="mean")

    def test_fill_unsupported_strategy_raises(self):
        df = pd.DataFrame({"a": [1, None, 3]})
        with pytest.raises(TransformationError, match="Unsupported fill strategy"):
            fill_empty(df, column_index=0, strategy="unknown")

    def test_fill_empty_mean_rounds_to_two_decimals(self):
        df = pd.DataFrame({"score": [10, None, 17.3333333333]})
        result = fill_empty(df, column_index=0, strategy="mean")
        assert result["score"].iloc[1] == 13.67

    def test_fill_empty_median_rounds_to_two_decimals(self):
        df = pd.DataFrame({"score": [10.111, None, 20.555]})
        result = fill_empty(df, column_index=0, strategy="median")
        assert result["score"].iloc[1] == 15.33


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


class TestRenameColumn:
    def test_rename_column_to_existing_name(self, sample_df):
        with pytest.raises(TransformationError, match="already exists"):
            rename_column(sample_df, 1, "name")  # Try to rename "age" to "name"

    def test_rename_column_to_same_name(self, sample_df):
        # Renaming to the same name should succeed (no-op)
        result = rename_column(sample_df, 0, "name")
        assert result.shape == sample_df.shape
        pd.testing.assert_frame_equal(result, sample_df)

    def test_rename_column_case_sensitive(self, sample_df):
        # Renaming to different case should succeed (case-sensitive)
        result = rename_column(sample_df, 1, "Age")  # Rename "age" to "Age"
        assert list(result.columns) == ["name", "Age", "city"]
        assert result.iloc[0]["Age"] == 30

    def test_rename_column_with_preexisting_duplicate(self):
        df = pd.DataFrame([[1, 2, 3]], columns=["name", "name", "age"])
        with pytest.raises(TransformationError, match="already exists"):
            rename_column(df, 2, "name")


class TestCastDataType:
    def test_cast_to_string(self, sample_df):
        result = cast_data_type(sample_df, "age", "string")
        # Values should be string representations regardless of exact dtype
        assert result["age"].iloc[0] == "30"
        assert result["age"].iloc[1] == "25"

    def test_cast_to_integer(self):
        df = pd.DataFrame({"val": ["1", "2", "bad", None]})
        result = cast_data_type(df, "val", "integer")
        assert result["val"].iloc[0] == 1
        assert pd.isna(result["val"].iloc[2])  # coerced NaN
        assert pd.isna(result["val"].iloc[3])  # coerced NaN

    def test_cast_to_float(self):
        df = pd.DataFrame({"val": ["1.5", "2.7", "bad"]})
        result = cast_data_type(df, "val", "float")
        assert pd.api.types.is_float_dtype(result["val"])
        assert result["val"].iloc[0] == 1.5

    def test_cast_integer_like_values_to_float(self):
        df = pd.DataFrame({"val": [1, 2, 3]})
        result = cast_data_type(df, "val", "float")
        assert pd.api.types.is_float_dtype(result["val"])
        assert result["val"].tolist() == [1.0, 2.0, 3.0]

    def test_cast_to_boolean_truthy_falsy(self):
        df = pd.DataFrame({"flag": ["true", "false", "yes", "no", "1", "0"]})
        result = cast_data_type(df, "flag", "boolean")
        assert result["flag"].iloc[0]
        assert not result["flag"].iloc[1]
        assert result["flag"].iloc[2]
        assert not result["flag"].iloc[3]
        assert result["flag"].iloc[4]
        assert not result["flag"].iloc[5]

    def test_cast_to_datetime(self):
        df = pd.DataFrame({"date": ["2024-01-01", "2024-06-15"]})
        result = cast_data_type(df, "date", "datetime")
        assert pd.api.types.is_datetime64_any_dtype(result["date"])
        assert result["date"].iloc[0] == pd.Timestamp("2024-01-01")

    def test_cast_invalid_column(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            cast_data_type(sample_df, "nonexistent", "integer")

    def test_cast_unsupported_type(self, sample_df):
        with pytest.raises(TransformationError, match="Unsupported target type"):
            cast_data_type(sample_df, "age", "complex")


class TestTrimWhitespace:
    def test_trim_specific_column(self):
        df = pd.DataFrame({"name": ["  Alice  ", " Bob", "Charlie "], "age": [30, 25, 35]})
        result = trim_whitespace(df, "name")
        assert result["name"].tolist() == ["Alice", "Bob", "Charlie"]
        # Non-target column should be unchanged
        assert result["age"].tolist() == [30, 25, 35]

    def test_trim_all_string_columns(self):
        df = pd.DataFrame(
            {
                "name": ["  Alice  ", " Bob"],
                "city": [" NYC ", "LA "],
                "age": [30, 25],
            }
        )
        result = trim_whitespace(df, "All string columns")
        assert result["name"].tolist() == ["Alice", "Bob"]
        assert result["city"].tolist() == ["NYC", "LA"]
        # Numeric column should be untouched
        assert result["age"].tolist() == [30, 25]

    def test_trim_column_not_found(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            trim_whitespace(sample_df, "nonexistent")


class TestDropNa:
    def test_drop_na_all_columns(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", None, "Charlie"],
                "age": [30, 25, None],
            }
        )
        result = drop_na(df, columns=None)
        assert len(result) == 1
        assert result.iloc[0]["name"] == "Alice"

    def test_drop_na_specific_columns(self):
        df = pd.DataFrame(
            {
                "name": ["Alice", None, "Charlie"],
                "age": [30, 25, None],
            }
        )
        # Only drop rows where 'age' is NaN; 'name' NaN row (index 1) has age=25 so it survives
        result = drop_na(df, columns=["age"])
        assert len(result) == 2
        assert result.iloc[0]["name"] == "Alice"
        assert result.iloc[1]["name"] is None or pd.isna(result.iloc[1]["name"])

    def test_drop_na_empty_columns_list_raises(self):
        df = pd.DataFrame({"name": ["Alice", None]})
        with pytest.raises(TransformationError, match="must not be empty"):
            drop_na(df, columns=[])

    def test_drop_na_nonexistent_column_raises(self):
        df = pd.DataFrame({"name": ["Alice", None]})
        with pytest.raises(TransformationError, match="not found"):
            drop_na(df, columns=["nonexistent"])


class TestApplyLoggedTransformation:
    # ------------------------------------------------------------------ addRow
    def test_add_row(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "addRow",
            {"row_params": {"index": 1}},
        )
        assert len(result) == 4
        assert result.iloc[1]["name"] == " "

    # ------------------------------------------------------------------ delRow
    def test_del_row(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "delRow",
            {"row_params": {"index": 1}},
        )

        assert len(result) == 2
        assert result["name"].tolist() == ["Alice", "Charlie"]
        assert list(result.index) == [0, 1]

    def test_del_row_out_of_range(self, sample_df):
        with pytest.raises(TransformationError, match="out of range"):
            apply_logged_transformation(
                sample_df,
                "delRow",
                {"row_params": {"index": 99}},
            )

    # ------------------------------------------------------------------ addCol
    def test_add_col_via_add_col_params(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "addCol",
            {"add_col_params": {"index": 1, "name": "email"}},
        )
        assert "email" in result.columns
        assert list(result.columns).index("email") == 1

    def test_add_col_via_col_params_fallback(self, sample_df):
        # col_params is the fallback key path
        result = apply_logged_transformation(
            sample_df,
            "addCol",
            {"col_params": {"index": 2, "name": "score"}},
        )
        assert "score" in result.columns
        assert list(result.columns).index("score") == 2

    # ------------------------------------------------------------------ delCol
    def test_del_col_via_del_col_params(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "delCol",
            {"del_col_params": {"index": 1}},
        )
        assert "age" not in result.columns

    def test_del_col_via_col_params_fallback(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "delCol",
            {"col_params": {"index": 2}},
        )
        assert "city" not in result.columns

    # -------------------------------------------------------- changeCellValue
    def test_change_cell_value(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "changeCellValue",
            {"change_cell_value": {"row_index": 0, "col_index": 1, "fill_value": "Alicia"}},
        )
        assert result.iloc[0]["name"] == "Alicia"

    # ---------------------------------------------------------------- fillEmpty
    def test_fill_empty_all_columns(self):
        df = pd.DataFrame({"a": [1, None], "b": [None, 2]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": 0}},
        )
        assert result["a"].tolist() == [1.0, 0]
        assert result["b"].tolist() == [0, 2.0]

    def test_fill_empty_specific_column(self):
        df = pd.DataFrame({"a": [1, None], "b": [None, 2]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": 99, "index": 0}},
        )
        assert result["a"].tolist() == [1.0, 99]
        assert pd.isna(result["b"].iloc[0])  # column b untouched

    def test_fill_empty_mean_strategy_replay(self):
        # Replay must pass the logged strategy into fill_empty so saved datasets match live transforms.
        df = pd.DataFrame({"score": [10, None, 30]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": None, "index": 0, "strategy": "mean"}},
        )
        assert result["score"].tolist() == [10.0, 20.0, 30.0]

    def test_fill_empty_median_strategy_replay(self):
        # Replay must support median because it is persisted in action_details like other parameters.
        df = pd.DataFrame({"score": [10, None, 50]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": None, "index": 0, "strategy": "median"}},
        )
        assert result["score"].tolist() == [10.0, 30.0, 50.0]

    def test_fill_empty_mode_strategy_replay(self):
        # Replay must support non-numeric mode fills for categorical data.
        df = pd.DataFrame({"city": ["Delhi", None, "Delhi", "Mumbai"]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": None, "index": 0, "strategy": "mode"}},
        )
        assert result["city"].tolist() == ["Delhi", "Delhi", "Delhi", "Mumbai"]

    def test_fill_empty_forward_fill_strategy_replay(self):
        # Replay must preserve forward-fill behavior for logged transformations.
        df = pd.DataFrame({"a": [1, None, None, 4]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": None, "index": 0, "strategy": "ffill"}},
        )
        assert result["a"].tolist() == [1.0, 1.0, 1.0, 4.0]

    def test_fill_empty_backward_fill_strategy_replay(self):
        # Replay must preserve backward-fill behavior for logged transformations.
        df = pd.DataFrame({"a": [None, None, 3, 4]})
        result = apply_logged_transformation(
            df,
            "fillEmpty",
            {"fill_empty_params": {"fill_value": None, "index": 0, "strategy": "bfill"}},
        )
        assert result["a"].tolist() == [3.0, 3.0, 3.0, 4.0]

    # -------------------------------------------------------------- dropDuplicate
    def test_drop_duplicate(self):
        df = pd.DataFrame({"name": ["Alice", "Bob", "Alice"], "age": [30, 25, 30]})
        result = apply_logged_transformation(
            df,
            "dropDuplicate",
            {"drop_duplicate": {"columns": "name", "keep": "first"}},
        )
        assert len(result) == 2
        assert result["name"].tolist().count("Alice") == 1

    # --------------------------------------------------------------- renameCol
    def test_rename_col(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "renameCol",
            {"rename_col_params": {"col_index": 1, "new_name": "years"}},
        )
        assert "years" in result.columns
        assert "age" not in result.columns

    # ------------------------------------------------------------ castDataType
    def test_cast_data_type(self, sample_df):
        result = apply_logged_transformation(
            sample_df,
            "castDataType",
            {"cast_data_type_params": {"column": "age", "target_type": "string"}},
        )
        assert result["age"].iloc[0] == "30"

    # ---------------------------------------------------------- trimWhitespace
    def test_trim_whitespace(self):
        df = pd.DataFrame({"name": ["  Alice  ", " Bob"], "age": [30, 25]})
        result = apply_logged_transformation(
            df,
            "trimWhitespace",
            {"trim_whitespace_params": {"column": "name"}},
        )
        assert result["name"].tolist() == ["Alice", "Bob"]

    # ------------------------------------------------------------------ dropNa
    def test_drop_na_all_columns(self):
        df = pd.DataFrame({"name": ["Alice", None], "age": [30, None]})
        result = apply_logged_transformation(
            df,
            "dropNa",
            {"drop_na_params": {"columns": None}},
        )
        assert len(result) == 1
        assert result.iloc[0]["name"] == "Alice"

    def test_drop_na_specific_columns(self):
        df = pd.DataFrame({"name": ["Alice", None, "Charlie"], "age": [30, 25, None]})
        result = apply_logged_transformation(
            df,
            "dropNa",
            {"drop_na_params": {"columns": ["age"]}},
        )
        assert len(result) == 2

    def test_drop_na_missing_drop_na_params_key(self, sample_df):
        # When drop_na_params key is absent entirely, columns defaults to None
        # (no NaN in sample_df, so all rows survive)
        result = apply_logged_transformation(sample_df, "dropNa", {})
        assert len(result) == len(sample_df)

    # --------------------------------------------------------- unknown action
    def test_unknown_action_type_raises_transformation_error(self, sample_df):
        with pytest.raises(TransformationError, match="Unknown action type"):
            apply_logged_transformation(sample_df, "nonExistentAction", {})
