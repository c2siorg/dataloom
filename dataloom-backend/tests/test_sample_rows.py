"""Tests for the sample rows transformation."""

import pandas as pd
import pytest

from app.services.transformation_service import TransformationError, sample_rows


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank"],
            "age": [30, 25, 35, 28, 32, 27],
            "city": ["New York", "LA", "Chicago", "Miami", "Seattle", "Boston"],
        }
    )


class TestSampleRows:
    def test_correct_count(self, sample_df):
        result = sample_rows(sample_df, 3)
        assert len(result) == 3

    def test_seed_reproducibility(self, sample_df):
        r1 = sample_rows(sample_df, 3, random_seed=42)
        r2 = sample_rows(sample_df, 3, random_seed=42)
        pd.testing.assert_frame_equal(r1, r2)

    def test_different_seeds_different_results(self, sample_df):
        r1 = sample_rows(sample_df, 3, random_seed=42)
        r2 = sample_rows(sample_df, 3, random_seed=99)
        assert not r1.equals(r2)

    def test_oversized_returns_all(self, sample_df):
        result = sample_rows(sample_df, 100)
        assert len(result) == 6

    def test_exact_size_returns_all(self, sample_df):
        result = sample_rows(sample_df, 6)
        assert len(result) == 6

    def test_size_one(self, sample_df):
        result = sample_rows(sample_df, 1)
        assert len(result) == 1

    def test_zero_raises(self, sample_df):
        with pytest.raises(TransformationError, match="positive"):
            sample_rows(sample_df, 0)

    def test_negative_raises(self, sample_df):
        with pytest.raises(TransformationError, match="positive"):
            sample_rows(sample_df, -5)

    def test_clean_index(self, sample_df):
        result = sample_rows(sample_df, 3, random_seed=42)
        assert result.index.tolist() == [0, 1, 2]

    def test_columns_preserved(self, sample_df):
        result = sample_rows(sample_df, 3)
        assert result.columns.tolist() == ["name", "age", "city"]

    def test_no_mutation(self, sample_df):
        original = sample_df.copy()
        sample_rows(sample_df, 3)
        pd.testing.assert_frame_equal(sample_df, original)
