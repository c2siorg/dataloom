"""Unit tests for the profiling service.

Tests cover:
- Numeric column statistics (min, max, mean, std, percentiles)
- Categorical column statistics (top_values, unique_count)
- Null handling
- Mixed DataFrame (numeric + categorical)
- Empty DataFrame edge case
"""

import pandas as pd
import pytest

from app.services.profiling_service import profile_dataframe


@pytest.fixture
def numeric_df():
    return pd.DataFrame(
        {
            "age":    [25, 30, 35, 40, 25],
            "salary": [50000.0, 60000.0, 70000.0, 80000.0, 55000.0],
        }
    )


@pytest.fixture
def categorical_df():
    return pd.DataFrame(
        {
            "city":    ["New York", "London", "New York", "Paris", "London"],
            "country": ["USA", "UK", "USA", "France", "UK"],
        }
    )


@pytest.fixture
def mixed_df():
    return pd.DataFrame(
        {
            "name":   ["Alice", "Bob", "Charlie", "Alice"],
            "score":  [85, 92, 78, 91],
            "passed": [True, True, False, True],
        }
    )


@pytest.fixture
def nulls_df():
    return pd.DataFrame(
        {
            "value": [1.0, None, 3.0, None, 5.0],
            "label": ["a", None, "c", None, "e"],
        }
    )


# ── Numeric columns ───────────────────────────────────────────────────────────


class TestNumericProfiling:
    def test_returns_one_profile_per_column(self, numeric_df):
        result = profile_dataframe(numeric_df)
        assert len(result) == 2

    def test_column_name_present(self, numeric_df):
        result = profile_dataframe(numeric_df)
        names = [p["column"] for p in result]
        assert "age" in names
        assert "salary" in names

    def test_dtype_is_int_or_float(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        assert result["age"]["dtype"] in ("int", "float")
        assert result["salary"]["dtype"] == "float"

    def test_count_equals_row_count(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        assert result["age"]["count"] == 5

    def test_null_count_zero_for_clean_column(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        assert result["age"]["null_count"] == 0
        assert result["age"]["null_pct"] == 0.0

    def test_unique_count_correct(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        # age has values [25, 30, 35, 40, 25] → 4 unique
        assert result["age"]["unique_count"] == 4

    def test_min_max_correct(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        assert result["age"]["min"] == pytest.approx(25.0)
        assert result["age"]["max"] == pytest.approx(40.0)

    def test_mean_correct(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        expected_mean = (25 + 30 + 35 + 40 + 25) / 5
        assert result["age"]["mean"] == pytest.approx(expected_mean, abs=0.01)

    def test_percentiles_present(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        for pct in ("p25", "p50", "p75"):
            assert result["age"][pct] is not None

    def test_p50_equals_median(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        expected_median = float(pd.Series([25, 30, 35, 40, 25]).median())
        assert result["age"]["p50"] == pytest.approx(expected_median, abs=0.01)

    def test_no_top_values_for_numeric(self, numeric_df):
        result = {p["column"]: p for p in profile_dataframe(numeric_df)}
        assert result["age"].get("top_values") is None


# ── Categorical columns ───────────────────────────────────────────────────────


class TestCategoricalProfiling:
    def test_dtype_is_str(self, categorical_df):
        result = {p["column"]: p for p in profile_dataframe(categorical_df)}
        assert result["city"]["dtype"] == "str"

    def test_top_values_present(self, categorical_df):
        result = {p["column"]: p for p in profile_dataframe(categorical_df)}
        assert "top_values" in result["city"]
        assert isinstance(result["city"]["top_values"], dict)

    def test_top_values_are_sorted_by_frequency(self, categorical_df):
        # "New York" and "London" both appear twice; "Paris" once
        result = {p["column"]: p for p in profile_dataframe(categorical_df)}
        top = result["city"]["top_values"]
        # The two most frequent should both have count 2
        counts = list(top.values())
        assert counts[0] >= counts[-1]

    def test_top_values_limited_to_five(self):
        df = pd.DataFrame({"col": [str(i % 10) for i in range(100)]})
        result = profile_dataframe(df)
        assert len(result[0]["top_values"]) <= 5

    def test_unique_count_correct(self, categorical_df):
        result = {p["column"]: p for p in profile_dataframe(categorical_df)}
        # city: "New York", "London", "Paris" → 3 unique
        assert result["city"]["unique_count"] == 3

    def test_no_numeric_stats_for_categorical(self, categorical_df):
        result = {p["column"]: p for p in profile_dataframe(categorical_df)}
        for key in ("min", "max", "mean", "std", "p25", "p50", "p75"):
            assert result["city"].get(key) is None


# ── Null handling ─────────────────────────────────────────────────────────────


class TestNullHandling:
    def test_null_count_correct(self, nulls_df):
        result = {p["column"]: p for p in profile_dataframe(nulls_df)}
        assert result["value"]["null_count"] == 2
        assert result["label"]["null_count"] == 2

    def test_null_pct_correct(self, nulls_df):
        result = {p["column"]: p for p in profile_dataframe(nulls_df)}
        # 2 nulls out of 5 rows = 40%
        assert result["value"]["null_pct"] == pytest.approx(40.0, abs=0.01)

    def test_numeric_stats_ignore_nulls(self, nulls_df):
        result = {p["column"]: p for p in profile_dataframe(nulls_df)}
        # Non-null values are 1.0, 3.0, 5.0
        assert result["value"]["min"] == pytest.approx(1.0)
        assert result["value"]["max"] == pytest.approx(5.0)


# ── Mixed DataFrame ───────────────────────────────────────────────────────────


class TestMixedDataFrame:
    def test_profile_length_equals_column_count(self, mixed_df):
        result = profile_dataframe(mixed_df)
        assert len(result) == 3

    def test_column_order_preserved(self, mixed_df):
        result = profile_dataframe(mixed_df)
        assert [p["column"] for p in result] == list(mixed_df.columns)

    def test_score_is_numeric(self, mixed_df):
        result = {p["column"]: p for p in profile_dataframe(mixed_df)}
        assert result["score"]["dtype"] in ("int", "float")
        assert result["score"]["min"] is not None

    def test_name_is_categorical(self, mixed_df):
        result = {p["column"]: p for p in profile_dataframe(mixed_df)}
        assert result["name"]["dtype"] == "str"
        assert "top_values" in result["name"]


# ── Edge cases ────────────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_empty_dataframe_returns_empty_list(self):
        df = pd.DataFrame()
        assert profile_dataframe(df) == []

    def test_single_column_dataframe(self):
        df = pd.DataFrame({"x": [1, 2, 3]})
        result = profile_dataframe(df)
        assert len(result) == 1
        assert result[0]["column"] == "x"

    def test_all_null_column(self):
        df = pd.DataFrame({"x": [None, None, None]})
        result = profile_dataframe(df)
        assert result[0]["null_count"] == 3
        assert result[0]["null_pct"] == 100.0