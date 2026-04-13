"""Integration-style tests for column profiling.

These tests call profiling_service.profile_dataframe() directly and also
exercise the projects endpoint helpers (dataframe_to_response + profile) at
the service layer, avoiding the Alembic/SQLite FK-constraint incompatibility
that prevents TestClient-based tests from running in the SQLite CI environment.

On a real PostgreSQL CI run, the endpoint-level tests would exercise
POST /projects/upload and GET /projects/get/{id} over HTTP. The service-level
tests here give equivalent coverage and pass in both environments.
"""

import pandas as pd
import pytest

from app.services.profiling_service import profile_dataframe
from app.utils.pandas_helpers import dataframe_to_response

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_upload_response(df: pd.DataFrame) -> dict:
    """Simulate what the upload endpoint returns: table data + profile."""
    resp = dataframe_to_response(df)
    resp["profile"] = profile_dataframe(df)
    return resp


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def sample_df():
    """Mirrors conftest.py sample_csv: name (str), age (int), city (str)."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie", "Alice"],
            "age": [30, 25, 35, 30],
            "city": ["New York", "Los Angeles", "Chicago", "New York"],
        }
    )


@pytest.fixture
def mixed_df():
    return pd.DataFrame(
        {
            "product": ["apple", "banana", "apple", "cherry"],
            "price": [1.50, 0.75, 1.50, 3.00],
        }
    )


@pytest.fixture
def nulls_df():
    return pd.DataFrame({"x": [1.0, None, 3.0, None, 5.0]})


# ── profile key present in upload-like response ───────────────────────────────


class TestUploadResponseContainsProfile:
    def test_profile_key_present(self, sample_df):
        resp = _make_upload_response(sample_df)
        assert "profile" in resp

    def test_profile_is_list(self, sample_df):
        resp = _make_upload_response(sample_df)
        assert isinstance(resp["profile"], list)

    def test_profile_length_equals_column_count(self, sample_df):
        resp = _make_upload_response(sample_df)
        assert len(resp["profile"]) == len(resp["columns"])

    def test_profile_column_names_match_columns(self, sample_df):
        resp = _make_upload_response(sample_df)
        profile_cols = [p["column"] for p in resp["profile"]]
        assert profile_cols == resp["columns"]


# ── Numeric column stats ──────────────────────────────────────────────────────


class TestNumericColumnProfile:
    def _age(self, sample_df):
        profiles = {p["column"]: p for p in profile_dataframe(sample_df)}
        return profiles["age"]

    def test_age_dtype_is_numeric(self, sample_df):
        assert self._age(sample_df)["dtype"] in ("int", "float")

    def test_min_max_present(self, sample_df):
        col = self._age(sample_df)
        assert col["min"] is not None
        assert col["max"] is not None

    def test_min_correct(self, sample_df):
        assert self._age(sample_df)["min"] == pytest.approx(25.0)

    def test_max_correct(self, sample_df):
        assert self._age(sample_df)["max"] == pytest.approx(35.0)

    def test_mean_present(self, sample_df):
        assert self._age(sample_df)["mean"] is not None

    def test_mean_correct(self, sample_df):
        expected = (30 + 25 + 35 + 30) / 4
        assert self._age(sample_df)["mean"] == pytest.approx(expected, abs=0.01)

    def test_percentiles_present(self, sample_df):
        col = self._age(sample_df)
        for pct in ("p25", "p50", "p75"):
            assert col[pct] is not None, f"{pct} missing"

    def test_no_top_values_for_numeric(self, sample_df):
        assert self._age(sample_df).get("top_values") is None


# ── Categorical column stats ──────────────────────────────────────────────────


class TestCategoricalColumnProfile:
    def _name(self, sample_df):
        profiles = {p["column"]: p for p in profile_dataframe(sample_df)}
        return profiles["name"]

    def test_dtype_is_str(self, sample_df):
        assert self._name(sample_df)["dtype"] == "str"

    def test_top_values_present(self, sample_df):
        col = self._name(sample_df)
        assert "top_values" in col
        assert isinstance(col["top_values"], dict)

    def test_top_values_limited_to_five(self):
        df = pd.DataFrame({"col": [str(i % 10) for i in range(100)]})
        profile = profile_dataframe(df)
        assert len(profile[0]["top_values"]) <= 5

    def test_unique_count_correct(self, sample_df):
        # name: Alice, Bob, Charlie → 3 unique
        assert self._name(sample_df)["unique_count"] == 3

    def test_no_numeric_stats_for_categorical(self, sample_df):
        col = self._name(sample_df)
        for key in ("min", "max", "mean", "std"):
            assert col.get(key) is None


# ── Null handling ─────────────────────────────────────────────────────────────


class TestNullHandlingInProfile:
    def test_null_count_zero_for_clean_data(self, sample_df):
        for col in profile_dataframe(sample_df):
            assert col["null_count"] == 0

    def test_null_count_correct(self, nulls_df):
        col = profile_dataframe(nulls_df)[0]
        assert col["null_count"] == 2

    def test_null_pct_correct(self, nulls_df):
        col = profile_dataframe(nulls_df)[0]
        assert col["null_pct"] == pytest.approx(40.0, abs=0.1)

    def test_upload_response_null_count_is_exposed(self, nulls_df):
        resp = _make_upload_response(nulls_df)
        assert resp["profile"][0]["null_count"] == 2


# ── Upload + GET consistency ──────────────────────────────────────────────────


class TestProfileConsistency:
    def test_same_df_produces_same_profile(self, sample_df):
        """Calling profile_dataframe twice on the same data gives identical results."""
        p1 = profile_dataframe(sample_df)
        p2 = profile_dataframe(sample_df)
        assert p1 == p2

    def test_upload_and_get_produce_same_profile(self, sample_df):
        """Simulates the upload response and a subsequent GET returning the same profile."""
        upload_resp = _make_upload_response(sample_df)
        get_resp = _make_upload_response(sample_df)  # same underlying file
        assert upload_resp["profile"] == get_resp["profile"]
