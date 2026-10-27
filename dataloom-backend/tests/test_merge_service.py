"""Unit tests for the relational dataset merging service (merge_service.py).

Verifies SQL-standard joins (inner, left, right, outer, cross), composite keys,
cardinality detection (1:1, 1:N, N:1, N:M), pre-join diagnostic analysis,
column conflict handling, type coercion, and Cartesian safety guardrails.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from app.services.merge_service import (
    MergeError,
    RelationshipType,
    analyze_merge,
    detect_relationship,
    merge_dataframes,
)


@pytest.fixture
def customers_df():
    """Customer demographic dimension table with unique customer_id."""
    return pd.DataFrame(
        {
            "customer_id": [1, 2, 3, 4],
            "name": ["Alice", "Bob", "Charlie", "Diana"],
            "city": ["New York", "Los Angeles", "Chicago", "Houston"],
        }
    )


@pytest.fixture
def orders_df():
    """Fact table containing transaction orders referencing customer_id."""
    return pd.DataFrame(
        {
            "order_id": [101, 102, 103, 104, 105],
            "customer_id": [1, 2, 2, 3, 99],  # customer 2 has multiple orders, customer 99 does not exist
            "amount": [250.0, 100.0, 75.0, 320.0, 50.0],
            "city": ["NY", "LA", "LA", "CHI", "MIA"],  # Overlapping column with customers_df
        }
    )


class TestRelationshipDetection:
    """Tests for cardinality relationship detection between join keys."""

    def test_one_to_one(self):
        """When keys are unique on both sides, relationship is one-to-one."""
        df1 = pd.DataFrame({"id": [1, 2, 3], "val1": ["a", "b", "c"]})
        df2 = pd.DataFrame({"id": [1, 2, 3], "val2": ["x", "y", "z"]})
        assert detect_relationship(df1, df2, ["id"], ["id"]) == RelationshipType.ONE_TO_ONE

    def test_one_to_many(self, customers_df, orders_df):
        """When left keys are unique but right keys have duplicates, relationship is one-to-many."""
        rel = detect_relationship(customers_df, orders_df, ["customer_id"], ["customer_id"])
        assert rel == RelationshipType.ONE_TO_MANY

    def test_many_to_one(self, orders_df, customers_df):
        """When left keys have duplicates but right keys are unique, relationship is many-to-one."""
        rel = detect_relationship(orders_df, customers_df, ["customer_id"], ["customer_id"])
        assert rel == RelationshipType.MANY_TO_ONE

    def test_many_to_many(self):
        """When keys have duplicates on both sides, relationship is many-to-many."""
        df1 = pd.DataFrame({"tag": ["python", "python", "fastapi"]})
        df2 = pd.DataFrame({"tag": ["python", "python", "pandas"]})
        assert detect_relationship(df1, df2, ["tag"], ["tag"]) == RelationshipType.MANY_TO_MANY

    def test_cross_join_empty_keys(self, customers_df, orders_df):
        """Empty keys represent cross joins."""
        assert detect_relationship(customers_df, orders_df, [], []) == RelationshipType.CROSS


class TestMergeExecution:
    """Tests for merge_dataframes execution across all join types."""

    def test_inner_join(self, customers_df, orders_df):
        """Inner join retains only records where keys exist in both datasets."""
        result = merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")
        # Customers 1, 2, 2, 3 match (4 orders). Customer 99 is excluded; customer 4 is excluded.
        assert len(result) == 4
        assert 99 not in result["customer_id"].values
        assert "Alice" in result["name"].values
        assert "Diana" not in result["name"].values
        # Overlapping column 'city' receives suffixes
        assert "city_left" in result.columns
        assert "city_right" in result.columns

    def test_left_join(self, orders_df, customers_df):
        """Left join preserves all left rows, filling unmatched right columns with NaN."""
        result = merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="left")
        assert len(result) == len(orders_df)  # 5 orders
        unmatched_row = result[result["customer_id"] == 99]
        assert len(unmatched_row) == 1
        assert pd.isna(unmatched_row["name"].iloc[0])

    def test_right_join(self, orders_df, customers_df):
        """Right join preserves all right rows, filling unmatched left columns with NaN."""
        result = merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="right")
        # Customer 4 has no orders, but survives with NaN for order columns
        c4_row = result[result["customer_id"] == 4]
        assert len(c4_row) == 1
        assert pd.isna(c4_row["order_id"].iloc[0])
        assert c4_row["name"].iloc[0] == "Diana"

    def test_outer_join(self, orders_df, customers_df):
        """Full outer join retains all rows from both datasets."""
        result = merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="outer")
        # 4 matched orders + 1 unmatched order (customer 99) + 1 unmatched customer (Diana, 4) = 6 rows
        assert len(result) == 6
        assert 99 in result["customer_id"].values
        assert "Diana" in result["name"].values

    def test_cross_join(self):
        """Cross join produces the Cartesian product without needing key columns."""
        df1 = pd.DataFrame({"color": ["red", "blue"]})
        df2 = pd.DataFrame({"size": ["S", "M", "L"]})
        result = merge_dataframes(df1, df2, how="cross")
        assert len(result) == 6
        assert list(result.columns) == ["color", "size"]

    def test_composite_keys(self):
        """Multi-column composite key join correctly aligns rows matching all keys."""
        df1 = pd.DataFrame(
            {
                "country": ["US", "US", "CA"],
                "state": ["CA", "NY", "ON"],
                "population": [39.0, 19.5, 14.8],
            }
        )
        df2 = pd.DataFrame(
            {
                "c_code": ["US", "US", "MX"],
                "s_code": ["CA", "TX", "NL"],
                "capital": ["Sacramento", "Austin", "Monterrey"],
            }
        )
        result = merge_dataframes(
            df1,
            df2,
            left_on=["country", "state"],
            right_on=["c_code", "s_code"],
            how="inner",
        )
        # Only US-CA matches
        assert len(result) == 1
        assert result.iloc[0]["capital"] == "Sacramento"

    def test_custom_suffixes(self, customers_df, orders_df):
        """Custom suffixes disambiguate colliding column names."""
        result = merge_dataframes(
            orders_df,
            customers_df,
            left_on="customer_id",
            right_on="customer_id",
            how="inner",
            suffixes=("_order", "_cust"),
        )
        assert "city_order" in result.columns
        assert "city_cust" in result.columns
        assert "city" not in result.columns

    def test_string_and_int_key_coercion(self):
        """Keys stored as integer and numeric string match transparently without user friction."""
        df1 = pd.DataFrame({"user_id": [101, 102], "score": [95, 88]})
        df2 = pd.DataFrame({"id": ["101", "102"], "tier": ["gold", "silver"]})

        result = merge_dataframes(df1, df2, left_on="user_id", right_on="id", how="inner")
        assert len(result) == 2
        assert "gold" in result["tier"].values

    def test_float_and_int_key_coercion(self):
        """Keys stored as int and whole float (e.g. 101 vs 101.0) match cleanly."""
        df1 = pd.DataFrame({"user_id": [101, 102], "score": [95, 88]})
        df2 = pd.DataFrame({"id": [101.0, 102.0], "tier": ["gold", "silver"]})

        result = merge_dataframes(df1, df2, left_on="user_id", right_on="id", how="inner")
        assert len(result) == 2

    def test_preserves_input_dataframes_unmodified(self, customers_df, orders_df):
        """Merge execution must not mutate the original input DataFrames."""
        cust_copy = customers_df.copy()
        orders_copy = orders_df.copy()

        merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")

        pd.testing.assert_frame_equal(customers_df, cust_copy)
        pd.testing.assert_frame_equal(orders_df, orders_copy)

    def test_returns_clean_range_index(self, customers_df, orders_df):
        """Resulting DataFrame always has a reset 0..N RangeIndex."""
        result = merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")
        assert isinstance(result.index, pd.RangeIndex)
        assert result.index.start == 0

    def test_nan_keys_do_not_join_each_other(self):
        """NaN values in join keys must never compare equal or join each other."""
        df1 = pd.DataFrame({"id": [1, np.nan, 3], "val1": ["a", "b", "c"]})
        df2 = pd.DataFrame({"id": [1, np.nan, 4], "val2": ["x", "y", "z"]})

        # Inner join: only id 1 matches, NaN rows must NOT join
        inner_res = merge_dataframes(df1, df2, left_on="id", right_on="id", how="inner")
        assert len(inner_res) == 1
        assert inner_res.iloc[0]["id"] == 1

        # Left join: NaN from df1 preserved with NaN for val2
        left_res = merge_dataframes(df1, df2, left_on="id", right_on="id", how="left")
        assert len(left_res) == 3
        b_row = left_res.loc[left_res["val1"] == "b"]
        assert pd.isna(b_row["val2"].iloc[0])

        # analyze_merge also must not match NaNs
        analysis = analyze_merge(df1, df2, left_on="id", right_on="id", how="inner")
        assert analysis["matched_left_rows"] == 1
        assert analysis["estimated_output_rows"] == 1

    def test_leading_zero_string_keys_preserved(self):
        """String keys with leading zeros (e.g. '007') are preserved as exact text and not cast to numbers."""
        df1 = pd.DataFrame({"code": ["007", "042"], "agent": ["Bond", "Hitchhiker"]})
        df2 = pd.DataFrame({"code": ["007", "7", "42"], "status": ["active", "int_7", "int_42"]})

        res = merge_dataframes(df1, df2, left_on="code", right_on="code", how="inner")
        assert len(res) == 1
        assert res.iloc[0]["code"] == "007"
        assert res.iloc[0]["status"] == "active"
        assert isinstance(res.iloc[0]["code"], str)

    def test_composite_keys_mixed_dtypes(self):
        """Multi-column composite keys with mixed int, float, string align identically in analysis and merge."""
        df1 = pd.DataFrame(
            {
                "dept_id": [10, 20, 30],
                "code": ["001", "002", "003"],
                "rate": [1.5, 2.0, 3.5],
                "val": ["A", "B", "C"],
            }
        )
        df2 = pd.DataFrame(
            {
                "d_id": [10, 20, 40],
                "c_val": ["001", "002", "004"],
                "multiplier": [1.5, 2.0, 5.0],
                "bonus": [100, 200, 400],
            }
        )
        keys_l = ["dept_id", "code", "rate"]
        keys_r = ["d_id", "c_val", "multiplier"]

        analysis = analyze_merge(df1, df2, left_on=keys_l, right_on=keys_r, how="inner")
        assert analysis["matched_left_rows"] == 2
        assert analysis["estimated_output_rows"] == 2

        res = merge_dataframes(df1, df2, left_on=keys_l, right_on=keys_r, how="inner")
        assert len(res) == 2
        assert set(res["dept_id"]) == {10, 20}


class TestSafetyGuardrails:
    """Tests for error handling, validation, and Cartesian explosion safeguards."""

    def test_missing_left_key_raises_error(self, customers_df, orders_df):
        """Missing column in left DataFrame raises MergeError."""
        with pytest.raises(MergeError, match="Left key column.*not found"):
            merge_dataframes(orders_df, customers_df, left_on="nonexistent", right_on="customer_id")

    def test_missing_right_key_raises_error(self, customers_df, orders_df):
        """Missing column in right DataFrame raises MergeError."""
        with pytest.raises(MergeError, match="Right key column.*not found"):
            merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="nonexistent")

    def test_mismatched_key_counts_raises_error(self, customers_df, orders_df):
        """Different numbers of left and right keys raises MergeError."""
        with pytest.raises(MergeError, match="Number of left keys .* does not match"):
            merge_dataframes(orders_df, customers_df, left_on=["customer_id", "city"], right_on=["customer_id"])

    def test_missing_keys_on_non_cross_join_raises_error(self, customers_df, orders_df):
        """Non-cross joins without keys raise MergeError."""
        with pytest.raises(MergeError, match="Join keys .* are required"):
            merge_dataframes(orders_df, customers_df, how="inner")

    def test_unsupported_join_type_raises_error(self, customers_df, orders_df):
        """Unsupported join types raise MergeError."""
        with pytest.raises(MergeError, match="Unsupported join type: 'invalid_join'"):
            merge_dataframes(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="invalid_join")

    def test_cartesian_explosion_limit_raises_error(self):
        """Many-to-many merge resulting in rows past max_rows_limit raises MergeError."""
        df1 = pd.DataFrame({"key": ["A"] * 200})
        df2 = pd.DataFrame({"key": ["A"] * 200})
        # 200 * 200 = 40,000 rows
        with pytest.raises(MergeError, match="exceeding the safety ceiling of 1,000 rows"):
            merge_dataframes(df1, df2, left_on="key", right_on="key", how="inner", max_rows_limit=1_000)

    def test_pre_merge_row_limit_aborts_non_cross_cartesian_explosion(self):
        """Pre-merge analysis aborts before pd.merge materialization when row ceiling is exceeded."""
        df1 = pd.DataFrame({"key": [1] * 500, "val1": range(500)})
        df2 = pd.DataFrame({"key": [1] * 500, "val2": range(500)})
        # 500 * 500 = 250,000 rows
        with pytest.raises(MergeError, match="exceeding the safety ceiling of 10,000 rows"):
            merge_dataframes(df1, df2, left_on="key", right_on="key", how="inner", max_rows_limit=10_000)

    def test_cross_join_safety_limit_raises_error(self):
        """Cross join with product past max_rows_limit raises MergeError before computing."""
        df1 = pd.DataFrame({"a": range(100)})
        df2 = pd.DataFrame({"b": range(100)})
        # 100 * 100 = 10,000 rows
        with pytest.raises(MergeError, match="Cross join would produce 10,000 rows, exceeding"):
            merge_dataframes(df1, df2, how="cross", max_rows_limit=5_000)


class TestPreMergeAnalysis:
    """Tests for pre-join diagnostic alignment analysis (analyze_merge)."""

    def test_analyze_merge_stats(self, customers_df, orders_df):
        """Calculates accurate match rates, row counts, and projected size."""
        report = analyze_merge(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")

        assert report["relationship"] == "many-to-one"
        assert report["left_row_count"] == 5
        assert report["right_row_count"] == 4
        assert report["matched_left_rows"] == 4  # 4 out of 5 orders matched
        assert report["unmatched_left_rows"] == 1
        assert report["match_rate_left"] == 80.0
        assert report["matched_right_rows"] == 3  # 3 out of 4 customers matched (1, 2, 3)
        assert report["unmatched_right_rows"] == 1
        assert report["match_rate_right"] == 75.0
        assert report["estimated_output_rows"] == 4
        assert report["has_duplicate_left_keys"] is True
        assert report["has_duplicate_right_keys"] is False
        assert "city" in report["column_conflicts"]

    def test_sample_unmatched_keys(self, customers_df, orders_df):
        """Returns samples of unmatched keys to assist debugging."""
        report = analyze_merge(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")
        # Customer 99 from orders_df did not match
        assert report["sample_unmatched_left_keys"] == [99]
        # Customer 4 from customers_df did not match
        assert report["sample_unmatched_right_keys"] == [4]

    def test_analyze_cross_join(self):
        """Cross join analysis reports 100% match rate and Cartesian product size."""
        df1 = pd.DataFrame({"x": [1, 2]})
        df2 = pd.DataFrame({"y": ["a", "b", "c"]})
        report = analyze_merge(df1, df2, how="cross")

        assert report["relationship"] == "cross"
        assert report["estimated_output_rows"] == 6
        assert report["match_rate_left"] == 100.0
        assert report["match_rate_right"] == 100.0
        assert report["sample_unmatched_left_keys"] == []

    def test_many_to_many_warning(self):
        """Diagnostic warning is generated when many-to-many join is detected."""
        df1 = pd.DataFrame({"category": ["book", "book", "game"]})
        df2 = pd.DataFrame({"category": ["book", "book", "music"]})
        report = analyze_merge(df1, df2, left_on="category", right_on="category", how="inner")

        assert report["relationship"] == "many-to-many"
        assert report["has_duplicate_left_keys"] is True
        assert report["has_duplicate_right_keys"] is True
        assert "Many-to-many join detected" in report["warning"]

    def test_low_match_rate_warning(self):
        """Warning generated when inner join drops more than 50% of primary rows."""
        df1 = pd.DataFrame({"id": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]})
        df2 = pd.DataFrame({"id": [1, 2]})
        report = analyze_merge(df1, df2, left_on="id", right_on="id", how="inner")

        assert report["match_rate_left"] == 20.0
        assert "Low left match rate" in report["warning"]

    def test_resulting_columns_metadata(self, customers_df, orders_df):
        """Resulting columns reflect disambiguated names and mapped data types."""
        report = analyze_merge(orders_df, customers_df, left_on="customer_id", right_on="customer_id", how="inner")
        col_names = [col["name"] for col in report["resulting_columns"]]
        assert "order_id" in col_names
        assert "customer_id" in col_names
        assert "city_left" in col_names
        assert "city_right" in col_names
        assert "name" in col_names
