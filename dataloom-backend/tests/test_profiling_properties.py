# Feature: column-data-profiling, Property 1: Dataset summary correctness
"""Property-based test: for any pandas DataFrame, the computed Dataset_Summary
fields match direct pandas computations.

**Validates: Requirements 1.1, 1.2, 1.3**
"""

import numpy as np
import pandas as pd
from hypothesis import given, settings, strategies as st

from app.services.profiling_service import compute_dataset_summary, compute_profile


# --- Custom DataFrame strategy ---

def dataframe_strategy():
    """Generate random DataFrames with a mix of numeric, string, and boolean columns,
    with random NaN placement. Keeps sizes small for test speed."""

    @st.composite
    def build_df(draw):
        n_rows = draw(st.integers(min_value=0, max_value=10))
        n_numeric = draw(st.integers(min_value=0, max_value=2))
        n_string = draw(st.integers(min_value=0, max_value=2))
        n_bool = draw(st.integers(min_value=0, max_value=1))

        data = {}
        col_idx = 0

        # Numeric columns
        for _ in range(n_numeric):
            values = draw(
                st.lists(
                    st.floats(
                        min_value=-1e6,
                        max_value=1e6,
                        allow_nan=False,
                        allow_infinity=False,
                    ),
                    min_size=n_rows,
                    max_size=n_rows,
                )
            )
            data[f"num_{col_idx}"] = values
            col_idx += 1

        # String columns
        for _ in range(n_string):
            values = draw(
                st.lists(
                    st.text(min_size=1, max_size=10),
                    min_size=n_rows,
                    max_size=n_rows,
                )
            )
            data[f"str_{col_idx}"] = values
            col_idx += 1

        # Boolean columns
        for _ in range(n_bool):
            values = draw(
                st.lists(
                    st.booleans(),
                    min_size=n_rows,
                    max_size=n_rows,
                )
            )
            data[f"bool_{col_idx}"] = values
            col_idx += 1

        df = pd.DataFrame(data)

        # Randomly inject NaN values into numeric and string columns
        if n_rows > 0 and len(df.columns) > 0:
            for col_name in df.columns:
                if col_name.startswith("num_") or col_name.startswith("str_"):
                    mask = draw(
                        st.lists(
                            st.booleans(),
                            min_size=n_rows,
                            max_size=n_rows,
                        )
                    )
                    for i, should_null in enumerate(mask):
                        if should_null:
                            df.at[i, col_name] = np.nan if col_name.startswith("num_") else None

        return df

    return build_df()


# --- Property test ---


@given(df=dataframe_strategy())
@settings(max_examples=100)
def test_dataset_summary_correctness(df: pd.DataFrame):
    """Property 1: Dataset summary correctness.

    For any pandas DataFrame, the computed Dataset_Summary should have:
    - row_count == len(df)
    - column_count == len(df.columns)
    - missing_count == df.isnull().sum().sum()
    - duplicate_row_count == df.duplicated().sum()
    - memory_usage_bytes == df.memory_usage(deep=True).sum()

    This includes edge cases where the DataFrame has zero rows or no missing values.

    **Validates: Requirements 1.1, 1.2, 1.3**
    """
    # Capture expected values BEFORE calling the service to avoid
    # any potential memory layout changes between calls.
    expected_row_count = len(df)
    expected_column_count = len(df.columns)
    expected_missing_count = int(df.isnull().sum().sum())
    expected_duplicate_row_count = int(df.duplicated().sum())
    expected_memory_usage = int(df.memory_usage(deep=True).sum())

    result = compute_dataset_summary(df)

    assert result.row_count == expected_row_count
    assert result.column_count == expected_column_count
    assert result.missing_count == expected_missing_count
    assert result.duplicate_row_count == expected_duplicate_row_count
    assert result.memory_usage_bytes == expected_memory_usage


# Feature: column-data-profiling, Property 2: Column profile count invariant


@given(df=dataframe_strategy())
@settings(max_examples=100)
def test_column_profile_count_invariant(df: pd.DataFrame):
    """Property 2: Column profile count invariant.

    For any pandas DataFrame, the number of ColumnProfileSchema objects
    returned by compute_profile should equal the number of columns in the
    DataFrame (len(df.columns)).

    **Validates: Requirements 2.1**
    """
    result = compute_profile(df)

    assert len(result.columns) == len(df.columns)


# Feature: column-data-profiling, Property 3: Per-column base stats correctness

import pytest


@given(df=dataframe_strategy())
@settings(max_examples=100)
def test_per_column_base_stats_correctness(df: pd.DataFrame):
    """Property 3: Per-column base stats correctness.

    For any pandas DataFrame and for any column in that DataFrame, the
    corresponding ColumnProfileSchema should have:
    - dtype in {"numeric", "categorical", "datetime", "boolean"}
    - missing_count == series.isnull().sum()
    - missing_percentage == (missing_count / len(df)) * 100 (or 0.0 if zero rows)
    - unique_count == series.nunique()

    **Validates: Requirements 2.2, 2.3**
    """
    result = compute_profile(df)

    valid_dtypes = {"numeric", "categorical", "datetime", "boolean"}

    for col_profile in result.columns:
        series = df[col_profile.name]

        # dtype must be one of the four valid types
        assert col_profile.dtype in valid_dtypes

        # missing_count must match pandas isnull().sum()
        expected_missing = int(series.isnull().sum())
        assert col_profile.missing_count == expected_missing

        # missing_percentage must match the formula
        if len(df) > 0:
            expected_pct = (expected_missing / len(df)) * 100
        else:
            expected_pct = 0.0
        assert col_profile.missing_percentage == pytest.approx(expected_pct)

        # unique_count must match series.nunique()
        expected_unique = int(series.nunique())
        assert col_profile.unique_count == expected_unique

# Feature: column-data-profiling, Property 4: Numeric stats correctness

import math

from app.services.profiling_service import compute_numeric_stats


def numeric_series_strategy():
    """Generate random numeric pandas Series with finite floats and optional NaN values."""

    @st.composite
    def build_series(draw):
        n = draw(st.integers(min_value=1, max_value=30))
        values = draw(
            st.lists(
                st.floats(
                    min_value=-1e6,
                    max_value=1e6,
                    allow_nan=False,
                    allow_infinity=False,
                ),
                min_size=n,
                max_size=n,
            )
        )
        series = pd.Series(values, dtype=float)

        # Randomly inject NaN values
        mask = draw(
            st.lists(st.booleans(), min_size=n, max_size=n)
        )
        for i, should_null in enumerate(mask):
            if should_null:
                series.iloc[i] = np.nan

        return series

    return build_series()


@given(series=numeric_series_strategy())
@settings(max_examples=100)
def test_numeric_stats_correctness(series: pd.Series):
    """Property 4: Numeric stats correctness.

    For any numeric column with at least one non-null value, the numeric_stats
    field should not be None and should have mean, median, std, min, max, q1, q3,
    and skewness approximately equal to the corresponding pandas computations.

    For numeric columns where all values are null, numeric_stats should be None.

    **Validates: Requirements 2.4, 2.6**
    """
    result = compute_numeric_stats(series)

    non_null = series.dropna()

    if len(non_null) == 0:
        # All-null column: numeric_stats should be None
        assert result is None
        return

    # At least one non-null value: result must not be None
    assert result is not None

    # Mean, median
    assert result.mean == pytest.approx(float(series.mean()), rel=1e-5, abs=1e-10)
    assert result.median == pytest.approx(float(series.median()), rel=1e-5, abs=1e-10)

    # Std: pandas returns NaN for single-element series
    expected_std = float(series.std())
    if math.isnan(expected_std):
        assert math.isnan(result.std)
    else:
        assert result.std == pytest.approx(expected_std, rel=1e-5, abs=1e-10)

    # Min and max: exact equality
    assert result.min == float(series.min())
    assert result.max == float(series.max())

    # Quartiles
    assert result.q1 == pytest.approx(float(series.quantile(0.25)), rel=1e-5, abs=1e-10)
    assert result.q3 == pytest.approx(float(series.quantile(0.75)), rel=1e-5, abs=1e-10)

    # Skewness: can be NaN for <3 values or zero variance
    expected_skew = float(series.skew())
    if math.isnan(expected_skew):
        assert math.isnan(result.skewness)
    else:
        assert result.skewness == pytest.approx(expected_skew, rel=1e-5, abs=1e-10)


# Feature: column-data-profiling, Property 5: Categorical stats correctness

from app.services.profiling_service import compute_categorical_stats


def categorical_series_strategy():
    """Generate random categorical pandas Series with text values and optional None values."""

    @st.composite
    def build_series(draw):
        n = draw(st.integers(min_value=1, max_value=30))
        # Use a small alphabet of category values to get meaningful frequency counts
        category_pool = draw(
            st.lists(
                st.text(
                    alphabet=st.characters(whitelist_categories=("L", "N")),
                    min_size=1,
                    max_size=8,
                ),
                min_size=1,
                max_size=6,
            )
        )
        values = draw(
            st.lists(
                st.sampled_from(category_pool),
                min_size=n,
                max_size=n,
            )
        )
        series = pd.Series(values, dtype=object)

        # Randomly inject None values
        mask = draw(st.lists(st.booleans(), min_size=n, max_size=n))
        for i, should_null in enumerate(mask):
            if should_null:
                series.iloc[i] = None

        return series

    return build_series()


@given(series=categorical_series_strategy())
@settings(max_examples=100)
def test_categorical_stats_correctness(series: pd.Series):
    """Property 5: Categorical stats correctness.

    For any categorical column with at least one non-null value, the
    categorical_stats field should not be None, top_values should have at most
    5 entries, each entry's count should match series.value_counts() for that
    value, and mode should equal the most frequent value.

    For categorical columns where all values are null, compute_categorical_stats
    should return None.

    **Validates: Requirements 2.5, 2.7**
    """
    result = compute_categorical_stats(series)

    non_null = series.dropna()

    if len(non_null) == 0:
        # All-null column: should return None
        assert result is None
        return

    # At least one non-null value: result must not be None
    assert result is not None

    # top_values should have at most 5 entries
    assert len(result.top_values) <= 5

    # Each entry's count should match series.value_counts() for that value
    # The service converts values to str(), so we need to compare against
    # value_counts on the original series (which also uses the original values)
    vc = series.value_counts()
    for entry in result.top_values:
        # Find the matching value in value_counts by converting to str
        matched = False
        for val, cnt in vc.items():
            if str(val) == entry.value:
                assert entry.count == int(cnt)
                matched = True
                break
        assert matched, f"Value '{entry.value}' not found in value_counts"

    # mode should equal the most frequent value (converted to string)
    expected_mode = str(series.mode().iloc[0])
    assert result.mode == expected_mode
