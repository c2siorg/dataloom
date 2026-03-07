"""Tests for dtype mapping and dataframe_to_response dtypes field."""

import pandas as pd
import pytest

from app.utils.pandas_helpers import _map_dtype, dataframe_to_response


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [30, 25, 35],
            "city": ["New York", "Los Angeles", "Chicago"],
        }
    )


class TestMapDtype:
    def test_int_column(self, sample_df):
        assert _map_dtype(sample_df["age"].dtype) == "int"

    def test_float_column(self):
        df = pd.DataFrame({"val": [1.5, 2.7]})
        assert _map_dtype(df["val"].dtype) == "float"

    def test_str_column(self, sample_df):
        assert _map_dtype(sample_df["name"].dtype) == "str"

    def test_bool_column(self):
        df = pd.DataFrame({"val": [True, False]})
        assert _map_dtype(df["val"].dtype) == "bool"

    def test_datetime_column(self):
        df = pd.DataFrame({"val": pd.to_datetime(["2024-01-01", "2024-06-15"])})
        assert _map_dtype(df["val"].dtype) == "datetime"


class TestDataframeToResponse:
    def test_includes_dtypes(self, sample_df):
        response = dataframe_to_response(sample_df)
        assert "dtypes" in response
        assert response["dtypes"]["name"] == "str"
        assert response["dtypes"]["age"] == "int"
        assert response["dtypes"]["city"] == "str"

    def test_dtypes_with_mixed_types(self):
        df = pd.DataFrame(
            {
                "id": [1, 2],
                "score": [9.5, 8.3],
                "active": [True, False],
                "label": ["a", "b"],
            }
        )
        response = dataframe_to_response(df)
        assert response["dtypes"]["id"] == "int"
        assert response["dtypes"]["score"] == "float"
        assert response["dtypes"]["active"] == "bool"
        assert response["dtypes"]["label"] == "str"

    def test_still_includes_columns_rows_row_count(self, sample_df):
        response = dataframe_to_response(sample_df)
        assert response["columns"] == ["name", "age", "city"]
        assert response["row_count"] == 3
        assert len(response["rows"]) == 3
