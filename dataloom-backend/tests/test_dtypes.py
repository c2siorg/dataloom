"""Tests for dtype mapping and dataframe_to_response dtypes field."""

import pandas as pd
import pytest

from app.utils.pandas_helpers import _infer_datetime_columns, dataframe_to_response, map_dtype


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
        assert map_dtype(sample_df["age"].dtype) == "int"

    def test_float_column(self):
        df = pd.DataFrame({"val": [1.5, 2.7]})
        assert map_dtype(df["val"].dtype) == "float"

    def test_str_column(self, sample_df):
        assert map_dtype(sample_df["name"].dtype) == "str"

    def test_bool_column(self):
        df = pd.DataFrame({"val": [True, False]})
        assert map_dtype(df["val"].dtype) == "bool"

    def test_datetime_column(self):
        df = pd.DataFrame({"val": pd.to_datetime(["2024-01-01", "2024-06-15"])})
        assert map_dtype(df["val"].dtype) == "datetime"


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

    def test_preserves_nulls_without_coercing_them_to_empty_strings(self):
        df = pd.DataFrame(
            {
                "maybe_missing": [None, ""],
                "score": [float("inf"), 5.5],
                "when": pd.to_datetime(["2024-01-01", None]),
            }
        )

        response = dataframe_to_response(df)

        assert response["rows"][0][0] is None
        assert response["rows"][1][0] == ""
        assert response["rows"][0][1] is None
        assert response["rows"][1][1] == 5.5
        assert response["rows"][0][2] == "2024-01-01"
        assert response["rows"][1][2] is None

    def test_preserves_non_scalar_cells_without_isna_truthiness_errors(self):
        df = pd.DataFrame(
            {
                "payload": [[1, 2], [None], {"ok": True}],
            }
        )

        response = dataframe_to_response(df)

        assert response["rows"][0][0] == [1, 2]
        assert response["rows"][1][0] == [None]
        assert response["rows"][2][0] == {"ok": True}


class TestInferDatetimeColumns:
    def test_converts_valid_datetime_column(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10",
                    "2024-02-11",
                    "2024-03-12",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result.at[0, "created_at"] == pd.Timestamp("2024-01-10")

    def test_supports_mixed_datetime_formats(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10",
                    "11/02/2024",
                    "March 12, 2024",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])

    def test_does_not_convert_bare_years(self):
        df = pd.DataFrame(
            {
                "grad_year": [
                    "2024",
                    "2025",
                    "2023",
                    "2022",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["grad_year"])
        assert result["grad_year"].tolist() == [
            "2024",
            "2025",
            "2023",
            "2022",
        ]

    def test_does_not_convert_numeric_ids(self):
        df = pd.DataFrame(
            {
                "student_id": [
                    "20240101",
                    "20240102",
                    "20240103",
                    "20240104",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["student_id"])
        assert result["student_id"].tolist() == [
            "20240101",
            "20240102",
            "20240103",
            "20240104",
        ]

    def test_does_not_convert_short_codes(self):
        df = pd.DataFrame(
            {
                "code": [
                    "A123",
                    "B456",
                    "C789",
                    "D012",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["code"])

    def test_does_not_convert_partial_dates(self):
        df = pd.DataFrame(
            {
                "period": [
                    "2024-01",
                    "2024-02",
                    "2024-03",
                    "2024-04",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["period"])

    def test_converts_at_exact_eighty_percent_threshold(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "2024-04-01",
                    "invalid",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["event_date"])
        assert pd.isna(result.at[4, "event_date"])

    def test_does_not_convert_below_eighty_percent_threshold(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "invalid",
                    "also-invalid",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_does_not_convert_when_date_shaped_values_are_invalid(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-13-01",
                    "2024-14-02",
                    "2024-15-03",
                    "2024-01-01",
                    "2024-02-01",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_does_not_mutate_original_dataframe(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-01",
                    "2024-02-01",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(df["created_at"])
        assert df["created_at"].tolist() == [
            "2024-01-01",
            "2024-02-01",
        ]

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result["created_at"].tolist() == [
            pd.Timestamp("2024-01-01"),
            pd.Timestamp("2024-02-01"),
        ]

    def test_does_not_convert_mixed_type_object_column(self):
        df = pd.DataFrame(
            {
                "value": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "2024-04-01",
                    123,
                ]
            },
            dtype=object,
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["value"])
        assert result["value"].tolist() == [
            "2024-01-01",
            "2024-02-01",
            "2024-03-01",
            "2024-04-01",
            123,
        ]

    def test_converts_datetime_values_with_time(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10 10:30:00",
                    "2024-02-11 11:45:30",
                    "2024-03-12T12:15:00",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result.at[0, "created_at"] == pd.Timestamp("2024-01-10 10:30:00")
