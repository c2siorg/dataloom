"""Tests for rename_column duplicate-name validation.

A rename must be refused when the new name matches an existing column exactly
or after trimming leading/trailing whitespace, because the two headers then
look identical in the UI (issue #725). Renaming a column to its own current
name stays a no-op.
"""

import pandas as pd
import pytest

from app.services.transformation_service import TransformationError, rename_column


@pytest.fixture
def three_columns() -> pd.DataFrame:
    """The dataset from the issue: Score is renamed into Total's namespace."""
    return pd.DataFrame({"Name": ["a", "b"], "Score": [1, 2], "Total": [10, 20]})


class TestRenameColumnDuplicateNames:
    """Test suite for the duplicate check in rename_column."""

    @pytest.mark.parametrize("new_name", ["Total ", " Total", " Total ", "Total"])
    def test_rename_matching_existing_column_is_refused(self, three_columns, new_name):
        """Names equal to 'Total' after trimming are refused like an exact duplicate."""
        with pytest.raises(TransformationError, match="already exists"):
            rename_column(three_columns, 1, new_name)

    def test_refused_rename_leaves_dataset_untouched(self, three_columns):
        """A refused rename raises instead of returning a renamed frame."""
        before = list(three_columns.columns)
        with pytest.raises(TransformationError):
            rename_column(three_columns, 1, "Total ")
        assert list(three_columns.columns) == before

    def test_rename_to_unique_name_is_allowed(self, three_columns):
        """An unrelated new name is accepted."""
        assert list(rename_column(three_columns, 1, "Points").columns) == ["Name", "Points", "Total"]

    @pytest.mark.parametrize("new_name", ["Score ", " Score", "Score"])
    def test_rename_to_own_name_is_a_noop(self, three_columns, new_name):
        """A column may keep its own name, whitespace included."""
        assert list(rename_column(three_columns, 1, new_name).columns) == ["Name", new_name, "Total"]

    def test_rename_can_clean_whitespace_from_own_name(self):
        """Renaming 'Total ' to 'Total' works when no other column is called Total."""
        df = pd.DataFrame({"Total ": [1, 2], "Name": ["a", "b"]})
        assert list(rename_column(df, 0, "Total").columns) == ["Total", "Name"]

    def test_rename_is_refused_when_target_has_whitespace_twin(self):
        """With both 'Total ' and 'Total' present, no column can be renamed into either form."""
        df = pd.DataFrame({"Score": [1], "Total ": [10], "Total": [20]})
        for index, new_name in ((0, "Total"), (0, "Total  "), (0, "Total "), (1, "Total"), (2, "Total ")):
            with pytest.raises(TransformationError, match="already exists"):
                rename_column(df, index, new_name)

    def test_unique_padded_name_does_not_collide(self):
        """A padded name is kept verbatim when nothing matches it after trimming."""
        df = pd.DataFrame({"Score": [1], "Total": [10]})
        assert list(rename_column(df, 0, "Points ").columns) == ["Points ", "Total"]
