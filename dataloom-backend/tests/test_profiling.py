"""Tests for the data profiling service and endpoints."""

import numpy as np
import pandas as pd
import pytest

from app.services import profiling_service as ps

# --- Service: dataset_summary ---


class TestDatasetSummary:
    def test_basic_shape_and_counts(self):
        df = pd.DataFrame(
            {
                "age": [30, 25, 35, 30],
                "name": ["Alice", "Bob", "Charlie", "Alice"],
            }
        )
        summary = ps.dataset_summary(df)
        assert summary["row_count"] == 4
        assert summary["column_count"] == 2
        assert summary["duplicate_row_count"] == 1
        assert summary["dtype_counts"] == {"int": 1, "str": 1}
        assert summary["numeric_columns"] == ["age"]
        assert summary["categorical_columns"] == ["name"]
        assert summary["memory_usage_bytes"] > 0

    def test_bool_and_datetime_columns_are_grouped_by_shape(self):
        df = pd.DataFrame(
            {
                "age": [30, 25],
                "name": ["Alice", "Bob"],
                "flag": [True, False],
                "joined": pd.to_datetime(["2020-01-01", "2020-02-01"]),
            }
        )
        summary = ps.dataset_summary(df)
        # Booleans get their own block in column_profile, so they must not be
        # reported as categorical; datetimes are no longer dropped entirely.
        assert summary["numeric_columns"] == ["age"]
        assert summary["categorical_columns"] == ["name"]
        assert summary["boolean_columns"] == ["flag"]
        assert summary["datetime_columns"] == ["joined"]

    def test_missing_cells_as_percentage_0_to_100(self):
        df = pd.DataFrame({"a": [1, None], "b": [None, None]})  # 3 of 4 cells missing
        summary = ps.dataset_summary(df)
        assert summary["total_missing_cells"] == 3
        assert summary["missing_cell_percentage"] == 75.0

    def test_empty_dataframe(self):
        summary = ps.dataset_summary(pd.DataFrame())
        assert summary["row_count"] == 0
        assert summary["column_count"] == 0
        assert summary["missing_cell_percentage"] == 0.0
        assert summary["duplicate_row_count"] == 0


# --- Service: column_profile ---


class TestColumnProfileCommon:
    def test_unknown_column_raises_keyerror(self):
        with pytest.raises(KeyError):
            ps.column_profile(pd.DataFrame({"a": [1]}), "missing")

    def test_null_and_unique_percentages(self):
        df = pd.DataFrame({"x": [1, 1, None, 2]})
        profile = ps.column_profile(df, "x")
        assert profile["null_count"] == 1
        assert profile["null_percentage"] == 25.0
        # unique_percentage is over non-null rows: 2 distinct / 3 non-null
        assert profile["unique_count"] == 2
        assert profile["unique_percentage"] == pytest.approx(66.6667, abs=1e-3)


class TestMissingValueSentinels:
    def test_string_sentinels_count_as_null(self):
        # "N/A" and "null" are missing-value sentinels, not real categories.
        df = pd.DataFrame({"c": ["a", "N/A", "null", "b"]})
        profile = ps.column_profile(df, "c")
        assert profile["null_count"] == 2
        assert profile["null_percentage"] == 50.0

    def test_sentinels_counted_in_dataset_summary(self):
        df = pd.DataFrame({"c": ["a", "N/A", "unknown"]})
        summary = ps.dataset_summary(df)
        assert summary["total_missing_cells"] == 2

    def test_matching_ignores_case_and_whitespace_but_not_real_values(self):
        # " Na " is a sentinel; "nathan" is a real value that merely starts with "na".
        df = pd.DataFrame({"c": [" Na ", "nathan", "b"]})
        profile = ps.column_profile(df, "c")
        assert profile["null_count"] == 1
        assert profile["unique_count"] == 2  # "nathan" and "b" survive


class TestColumnProfileNumeric:
    def test_numeric_stats(self):
        df = pd.DataFrame({"v": [1, 2, 3, 4]})
        profile = ps.column_profile(df, "v")
        assert profile["dtype"] == "int"
        assert profile["mean"] == 2.5
        assert profile["median"] == 2.5
        assert profile["min"] == 1.0
        assert profile["max"] == 4.0
        assert profile["q1"] == 1.75
        assert profile["q3"] == 3.25
        assert profile["std"] is not None

    def test_zero_and_negative_counts(self):
        df = pd.DataFrame({"v": [-2, -1, 0, 0, 3, None]})
        profile = ps.column_profile(df, "v")
        assert profile["zero_count"] == 2
        assert profile["negative_count"] == 2

    def test_constant_column_is_json_safe_and_labeled_constant(self):
        df = pd.DataFrame({"v": [5, 5, 5, 5]})
        profile = ps.column_profile(df, "v")
        # A constant column has zero spread; values stay finite (JSON-safe).
        assert profile["std"] == 0.0
        assert profile["distribution"] == "constant"

    def test_too_few_values_skew_is_none(self):
        # skew needs 3+ values; with 2 it is NaN and must serialize as None.
        df = pd.DataFrame({"v": [1, 2]})
        profile = ps.column_profile(df, "v")
        assert profile["skew"] is None

    def test_right_skewed_distribution(self):
        df = pd.DataFrame({"v": [1, 1, 1, 1, 1, 2, 3, 50]})
        profile = ps.column_profile(df, "v")
        assert profile["distribution"] == "right-skewed"

    def test_zero_inflated_distribution(self):
        df = pd.DataFrame({"v": [0, 0, 0, 0, 0, 0, 1, 7]})
        profile = ps.column_profile(df, "v")
        assert profile["distribution"] == "zero-inflated"

    def test_all_null_numeric_column(self):
        df = pd.DataFrame({"v": pd.Series([None, None, None], dtype="float64")})
        profile = ps.column_profile(df, "v")
        assert profile["null_percentage"] == 100.0
        assert profile["mean"] is None
        assert profile["distribution"] == "unknown"


class TestColumnProfileBoolean:
    def test_boolean_block_counts(self):
        df = pd.DataFrame({"flag": pd.Series([True, True, False, None], dtype="boolean")})
        profile = ps.column_profile(df, "flag")
        assert profile["dtype"] == "bool"
        assert profile["true_count"] == 2
        assert profile["false_count"] == 1
        # true_percentage is over non-null rows: 2 of 3
        assert profile["true_percentage"] == pytest.approx(66.6667, abs=1e-3)

    def test_boolean_omits_categorical_block(self):
        df = pd.DataFrame({"flag": [True, False, True]})
        profile = ps.column_profile(df, "flag")
        assert "top_values" not in profile
        assert "cardinality" not in profile


class TestColumnProfileCategorical:
    def test_top_values_and_cardinality(self):
        df = pd.DataFrame({"c": ["a", "a", "a", "b", "c"]})
        profile = ps.column_profile(df, "c")
        assert profile["dtype"] == "str"
        assert profile["cardinality"] == 3
        assert profile["top_values"][0] == {"value": "a", "count": 3, "percentage": 60.0}
        assert profile["dominant_value_percentage"] == 60.0

    def test_binary_distribution(self):
        df = pd.DataFrame({"c": ["yes", "no", "yes", "no"]})
        profile = ps.column_profile(df, "c")
        assert profile["distribution"] == "binary"

    def test_high_cardinality_distribution(self):
        df = pd.DataFrame({"c": [f"id-{i}" for i in range(20)]})
        profile = ps.column_profile(df, "c")
        assert profile["distribution"] == "high-cardinality"


class TestColumnProfileDatetime:
    def test_datetime_range_and_granularity(self):
        df = pd.DataFrame({"d": pd.to_datetime(["2020-01-01", "2020-01-02", "2020-01-03"])})
        profile = ps.column_profile(df, "d")
        assert profile["dtype"] == "datetime"
        assert profile["min_date"].startswith("2020-01-01")
        assert profile["max_date"].startswith("2020-01-03")
        assert profile["range_days"] == 2
        assert profile["inferred_granularity"] == "day"

    def test_single_datetime_value_has_no_granularity(self):
        df = pd.DataFrame({"d": pd.to_datetime(["2020-01-01"])})
        profile = ps.column_profile(df, "d")
        assert profile["range_days"] == 0
        assert profile["inferred_granularity"] is None


# --- Service: correlation_matrix ---


class TestCorrelationMatrix:
    def test_pairwise_correlation(self):
        df = pd.DataFrame({"a": [1, 2, 3, 4], "b": [2, 4, 6, 8], "name": ["w", "x", "y", "z"]})
        result = ps.correlation_matrix(df)
        assert result["columns"] == ["a", "b"]  # str column excluded
        assert result["matrix"][0][0] == 1.0
        assert result["matrix"][0][1] == pytest.approx(1.0)  # perfectly correlated

    def test_zero_numeric_columns(self):
        df = pd.DataFrame({"name": ["a", "b"]})
        assert ps.correlation_matrix(df) == {"columns": [], "matrix": []}

    def test_single_numeric_column(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        result = ps.correlation_matrix(df)
        assert result["columns"] == ["a"]
        assert result["matrix"] == [[1.0]]

    def test_constant_column_correlation_is_none_not_nan(self):
        df = pd.DataFrame({"a": [1, 2, 3], "const": [5, 5, 5]})
        result = ps.correlation_matrix(df)
        # corr against a zero-variance column is NaN -> must be None.
        const_idx = result["columns"].index("const")
        other_idx = result["columns"].index("a")
        assert result["matrix"][const_idx][other_idx] is None


# --- Service: detect_distribution helper ---


class TestDetectDistribution:
    def test_normal_ish(self):
        label = ps.detect_distribution(unique_count=50, row_count=100, null_count=0, skew=0.1, zero_fraction=0.0)
        assert label == "normal-ish"

    def test_left_skewed(self):
        label = ps.detect_distribution(unique_count=50, row_count=100, null_count=0, skew=-1.2, zero_fraction=0.0)
        assert label == "left-skewed"

    def test_all_null_is_unknown(self):
        label = ps.detect_distribution(unique_count=0, row_count=5, null_count=5, skew=None, zero_fraction=None)
        assert label == "unknown"


# --- JSON safety guard across the whole profile ---


def test_profile_emits_no_nan_or_inf():
    """Every numeric leaf must be JSON-safe (None, not NaN/inf)."""
    df = pd.DataFrame({"v": [1.0, np.inf, np.nan, 5.0], "const": [1, 1, 1, 1]})
    profile = ps.column_profile(df, "const")
    for value in profile.values():
        if isinstance(value, float):
            assert np.isfinite(value)


# --- Endpoints ---


@pytest.fixture
def project(client, sample_csv):
    """Upload the sample CSV and return the created project payload."""
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Profiling", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def project_id(project):
    return project["project_id"]


class TestProfilingEndpoints:
    def test_summary(self, client, project_id):
        response = client.get(f"/projects/{project_id}/profile/summary")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["row_count"] == 4  # sample_csv has a duplicate row
        assert body["duplicate_row_count"] == 1
        assert "age" in body["numeric_columns"]

    def test_column_profile(self, client, project_id):
        response = client.get(f"/projects/{project_id}/profile/column", params={"column_name": "age"})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["column"] == "age"
        assert body["dtype"] == "int"
        assert body["mean"] is not None

    def test_unknown_column_returns_404(self, client, project_id):
        response = client.get(f"/projects/{project_id}/profile/column", params={"column_name": "nope"})
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_column_name_with_slash_is_profiled_not_404(self, client, tmp_path):
        csv_path = tmp_path / "slash.csv"
        csv_path.write_text("revenue/cost,n\n1.5,a\n2.5,b\n")
        with open(csv_path, "rb") as f:
            upload = client.post(
                "/projects/upload",
                files={"file": ("slash.csv", f, "text/csv")},
                data={"projectName": "Slash", "projectDescription": "fixture"},
            )
        assert upload.status_code == 200, upload.text
        pid = upload.json()["project_id"]
        # A query param carries the literal slash, so routing never depends on
        # how the server treats %2F in the path.
        response = client.get(f"/projects/{pid}/profile/column", params={"column_name": "revenue/cost"})
        assert response.status_code == 200, response.text
        assert response.json()["column"] == "revenue/cost"

    def test_correlation(self, client, project_id):
        response = client.get(f"/projects/{project_id}/profile/correlation")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["columns"] == ["age"]  # only numeric column in the sample

    def test_requires_auth(self, anon_client, project_id):
        response = anon_client.get(f"/projects/{project_id}/profile/summary")
        assert response.status_code == 401
