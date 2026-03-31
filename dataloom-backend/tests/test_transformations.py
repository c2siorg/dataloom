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

    def test_cast_to_boolean_truthy_falsy(self):
        df = pd.DataFrame({"flag": ["true", "false", "yes", "no", "1", "0"]})
        result = cast_data_type(df, "flag", "boolean")
        assert result["flag"].iloc[0] is True or result["flag"].iloc[0] == True
        assert result["flag"].iloc[1] is False or result["flag"].iloc[1] == False
        assert result["flag"].iloc[2] is True or result["flag"].iloc[2] == True
        assert result["flag"].iloc[3] is False or result["flag"].iloc[3] == False
        assert result["flag"].iloc[4] is True or result["flag"].iloc[4] == True
        assert result["flag"].iloc[5] is False or result["flag"].iloc[5] == False

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
        # df.drop(1) keeps the original index labels; Bob is gone
        assert 1 not in result.index
        assert "Bob" not in result["name"].values

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
    def test_unknown_action_type_returns_df_unchanged(self, sample_df):
        result = apply_logged_transformation(sample_df, "nonExistentAction", {})
        pd.testing.assert_frame_equal(result, sample_df)
