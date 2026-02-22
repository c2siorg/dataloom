# Feature: column-data-profiling, Property 6: Profile response serialization round-trip
"""Property-based test: serializing a ProfileResponse to JSON and deserializing it back
produces an equivalent object.

**Validates: Requirements 7.5**
"""

from hypothesis import given, settings, strategies as st

from app.schemas import (
    CategoricalStatsSchema,
    ColumnProfileSchema,
    DatasetSummarySchema,
    FrequentValueSchema,
    NumericStatsSchema,
    ProfileResponse,
)

# --- Hypothesis strategies for each schema ---

# Finite floats only — no NaN/Inf which would break JSON round-trip equality
finite_floats = st.floats(allow_nan=False, allow_infinity=False)
optional_finite_floats = st.none() | finite_floats


def numeric_stats_strategy():
    """Generate a random NumericStatsSchema."""
    return st.builds(
        NumericStatsSchema,
        mean=optional_finite_floats,
        median=optional_finite_floats,
        std=optional_finite_floats,
        min=optional_finite_floats,
        max=optional_finite_floats,
        q1=optional_finite_floats,
        q3=optional_finite_floats,
        skewness=optional_finite_floats,
    )


def frequent_value_strategy():
    """Generate a random FrequentValueSchema."""
    return st.builds(
        FrequentValueSchema,
        value=st.text(min_size=0, max_size=50),
        count=st.integers(min_value=0, max_value=10_000),
    )


def categorical_stats_strategy():
    """Generate a random CategoricalStatsSchema."""
    return st.builds(
        CategoricalStatsSchema,
        top_values=st.lists(frequent_value_strategy(), min_size=0, max_size=5),
        mode=st.none() | st.text(min_size=0, max_size=50),
    )


VALID_DTYPES = ["numeric", "categorical", "datetime", "boolean"]


def column_profile_strategy():
    """Generate a random ColumnProfileSchema with type-appropriate stats."""
    return st.builds(
        ColumnProfileSchema,
        name=st.text(min_size=1, max_size=30),
        dtype=st.sampled_from(VALID_DTYPES),
        missing_count=st.integers(min_value=0, max_value=10_000),
        missing_percentage=st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False),
        unique_count=st.integers(min_value=0, max_value=10_000),
        numeric_stats=st.none() | numeric_stats_strategy(),
        categorical_stats=st.none() | categorical_stats_strategy(),
    )


def dataset_summary_strategy():
    """Generate a random DatasetSummarySchema."""
    return st.builds(
        DatasetSummarySchema,
        row_count=st.integers(min_value=0, max_value=100_000),
        column_count=st.integers(min_value=0, max_value=500),
        missing_count=st.integers(min_value=0, max_value=100_000),
        memory_usage_bytes=st.integers(min_value=0, max_value=10**9),
        duplicate_row_count=st.integers(min_value=0, max_value=100_000),
    )


def profile_response_strategy():
    """Generate a random ProfileResponse."""
    return st.builds(
        ProfileResponse,
        summary=dataset_summary_strategy(),
        columns=st.lists(column_profile_strategy(), min_size=0, max_size=20),
    )


# --- Property test ---


@given(profile=profile_response_strategy())
@settings(max_examples=100)
def test_profile_response_serialization_round_trip(profile: ProfileResponse):
    """Property 6: Serializing a ProfileResponse to JSON and deserializing it back
    produces an equivalent ProfileResponse object.

    **Validates: Requirements 7.5**
    """
    json_str = profile.model_dump_json()
    restored = ProfileResponse.model_validate_json(json_str)
    assert restored == profile
