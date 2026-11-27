"""Tests for column-name resolution in column-targeted transformations.

Covers the shared ``_resolve_column`` helper and the transformations that use
it (filter, outlier handling, scaling, clamping): exact matches win, a stripped
match is accepted only when unambiguous, and names that collide after
trimming whitespace are refused instead of resolving to the wrong column.
"""

import pandas as pd
import pytest

from app.schemas import OperationType
from app.services.transformation_service import (
    TransformationError,
    _resolve_column,
    apply_filter,
    apply_logged_transformation,
    clip_numeric,
    handle_outliers,
    scale_numeric,
)


@pytest.fixture
def colliding_df() -> pd.DataFrame:
    """Columns whose names differ only by whitespace and hold distinct values."""
    return pd.DataFrame({"Score ": [1, 2, 3, 100], "Score": [10, 20, 30, 40]})


@pytest.fixture
def trailing_space_df() -> pd.DataFrame:
    """A single column whose name has trailing whitespace."""
    return pd.DataFrame({"Score ": [1, 2, 3, 4]})


class TestResolveColumn:
    """Test suite for the shared column-name resolver."""

    def test_exact_match_wins_over_stripped_match(self, colliding_df: pd.DataFrame):
        """An exact label is returned even though another column shares its stripped form."""
        assert _resolve_column(colliding_df, "Score ") == "Score "
        assert _resolve_column(colliding_df, "Score") == "Score"

    def test_stripped_match_when_unambiguous(self, trailing_space_df: pd.DataFrame):
        """A name is matched to its stripped counterpart when only one column fits."""
        assert _resolve_column(trailing_space_df, "Score") == "Score "
        assert _resolve_column(trailing_space_df, " Score ") == "Score "

    def test_colliding_names_are_refused(self, colliding_df: pd.DataFrame):
        """A name matching several columns after trimming is reported as ambiguous."""
        with pytest.raises(TransformationError, match="ambiguous"):
            _resolve_column(colliding_df, "Score  ")

    def test_unknown_name_reports_not_found(self, trailing_space_df: pd.DataFrame):
        """A name matching nothing keeps the original not-found error."""
        with pytest.raises(TransformationError, match="not found"):
            _resolve_column(trailing_space_df, "Total")


class TestFilterOnWhitespaceCollidingNames:
    """Test suite for apply_filter with whitespace-colliding column names."""

    def test_filter_targets_the_requested_column(self, colliding_df: pd.DataFrame):
        """Filtering 'Score ' uses the first column, not the one that overwrote it."""
        result = apply_filter(colliding_df, "Score ", "=", "1")
        assert result["Score "].tolist() == [1]
        assert result["Score"].tolist() == [10]

    def test_filter_targets_the_exact_second_column(self, colliding_df: pd.DataFrame):
        """Filtering 'Score' uses the second column."""
        result = apply_filter(colliding_df, "Score", "=", "30")
        assert result["Score"].tolist() == [30]
        assert result["Score "].tolist() == [3]

    def test_stripped_name_is_refused_when_ambiguous(self, colliding_df: pd.DataFrame):
        """A name that could mean either column is refused rather than guessing."""
        with pytest.raises(TransformationError, match="ambiguous"):
            apply_filter(colliding_df, "Score  ", "=", "1")

    def test_stripped_name_still_works_when_unique(self, trailing_space_df: pd.DataFrame):
        """Backward compatibility: a stripped name still resolves to a lone column."""
        result = apply_filter(trailing_space_df, "Score", "=", "2")
        assert result["Score "].tolist() == [2]

    def test_logged_replay_targets_the_recorded_column(self, colliding_df: pd.DataFrame):
        """Log replay resolves the same column as the original preview."""
        details = {"parameters": {"column": "Score ", "condition": "=", "value": "1"}}
        result = apply_logged_transformation(colliding_df, OperationType.filter, details)
        assert result["Score "].tolist() == [1]
        assert result["Score"].tolist() == [10]


@pytest.mark.parametrize(
    ("func", "kwargs", "expected"),
    [
        (
            handle_outliers,
            {"method": "iqr", "action": "flag", "flag_column": "is_outlier"},
            {"is_outlier": [False, False, False, True]},
        ),
        (scale_numeric, {}, {"Score ": pytest.approx([0.0, 1 / 99, 2 / 99, 1.0])}),
        (clip_numeric, {"lower": 15}, {"Score ": [15, 15, 15, 100]}),
    ],
    ids=["handle_outliers", "scale_numeric", "clip_numeric"],
)
class TestNumericTransformsOnWhitespaceCollidingNames:
    """Test suite for the numeric transformations sharing the resolver."""

    def test_exact_name_targets_the_requested_column(self, colliding_df, func, kwargs, expected):
        """The column named exactly is transformed; the colliding column is untouched."""
        result = func(colliding_df, "Score ", **kwargs)
        for column, values in expected.items():
            assert result[column].tolist() == values
        assert result["Score"].tolist() == [10, 20, 30, 40]

    def test_colliding_name_is_refused(self, colliding_df, func, kwargs, expected):
        """A name matching both columns after trimming is refused."""
        with pytest.raises(TransformationError, match="ambiguous"):
            func(colliding_df, "Score  ", **kwargs)
