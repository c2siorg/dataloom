"""Tests for the dataset comparison service."""

import pandas as pd
import pytest

from app.services.dataset_comparison_service import compare_dataframes


class TestCompareDataframes:
    def test_positional_matching_detects_changed_cells(self):
        checkpoint = pd.DataFrame(
            {
                "name": ["Alice", "Bob"],
                "age": [20, 21],
            }
        )
        current = pd.DataFrame(
            {
                "name": ["Alice", "Bobby"],
                "age": [20, 22],
            }
        )

        result = compare_dataframes(checkpoint, current)

        assert result.matching_strategy == "positional"
        assert result.summary["checkpoint_rows"] == 2
        assert result.summary["current_rows"] == 2
        assert result.summary["changed_cells"] == 2
        assert result.summary["affected_rows"] == 1
        assert result.summary["affected_columns"] == 2

        assert result.cells == [
            {
                "row": 1,
                "column": "name",
                "checkpoint_value": "Bob",
                "current_value": "Bobby",
            },
            {
                "row": 1,
                "column": "age",
                "checkpoint_value": 21,
                "current_value": 22,
            },
        ]

    def test_identifier_matching_detects_added_removed_and_changed_rows(self):
        checkpoint = pd.DataFrame(
            {
                "id": [1, 2],
                "name": ["Alice", "Bob"],
                "age": [20, 21],
            }
        )
        current = pd.DataFrame(
            {
                "id": [1, 2, 3],
                "name": ["Alice", "Bobby", "Charlie"],
                "age": [20, 22, 25],
            }
        )

        result = compare_dataframes(
            checkpoint,
            current,
            match_column="id",
        )

        assert result.matching_strategy == "identifier:id"
        assert result.summary["added_rows"] == 1
        assert result.summary["removed_rows"] == 0
        assert result.summary["changed_cells"] == 2

        assert result.rows == [
            {
                "type": "added",
                "row": 3,
                "checkpoint_index": None,
                "current_index": 2,
            }
        ]

    def test_detects_removed_rows(self):
        checkpoint = pd.DataFrame({"id": [1, 2, 3]})
        current = pd.DataFrame({"id": [1, 2]})

        result = compare_dataframes(
            checkpoint,
            current,
            match_column="id",
        )

        assert result.summary["removed_rows"] == 1
        assert result.summary["added_rows"] == 0
        assert result.rows == [
            {
                "type": "removed",
                "row": 3,
                "checkpoint_index": 2,
                "current_index": None,
            }
        ]

    def test_detects_added_and_removed_columns(self):
        checkpoint = pd.DataFrame(
            {
                "id": [1],
                "name": ["Alice"],
            }
        )
        current = pd.DataFrame(
            {
                "id": [1],
                "email": ["alice@example.com"],
            }
        )

        result = compare_dataframes(checkpoint, current)

        assert result.columns["added"] == ["email"]
        assert result.columns["removed"] == ["name"]

    def test_detects_dtype_changes(self):
        checkpoint = pd.DataFrame(
            {
                "id": [1, 2],
                "value": [10, 20],
            }
        )
        current = pd.DataFrame(
            {
                "id": [1, 2],
                "value": ["10", "20"],
            }
        )

        result = compare_dataframes(checkpoint, current)

        assert result.columns["dtype_changed"] == [
            {
                "name": "value",
                "before": "int64",
                "after": "str",
            }
        ]

    def test_missing_values_are_treated_as_equal(self):
        checkpoint = pd.DataFrame(
            {
                "id": [1],
                "value": [None],
            }
        )
        current = pd.DataFrame(
            {
                "id": [1],
                "value": [None],
            }
        )

        result = compare_dataframes(checkpoint, current)

        assert result.summary["changed_cells"] == 0
        assert result.cells == []

    def test_identifier_column_must_exist_in_both_datasets(self):
        checkpoint = pd.DataFrame({"id": [1]})
        current = pd.DataFrame({"other_id": [1]})

        with pytest.raises(
            ValueError,
            match="Match column 'id' is not present in both datasets",
        ):
            compare_dataframes(
                checkpoint,
                current,
                match_column="id",
            )

    def test_identifier_column_must_be_unique(self):
        checkpoint = pd.DataFrame({"id": [1, 1]})
        current = pd.DataFrame({"id": [1, 2]})

        with pytest.raises(
            ValueError,
            match="must contain unique values",
        ):
            compare_dataframes(
                checkpoint,
                current,
                match_column="id",
            )

    def test_pagination(self):
        checkpoint = pd.DataFrame(
            {
                "id": [1, 2, 3],
                "value": ["a", "b", "c"],
            }
        )
        current = pd.DataFrame(
            {
                "id": [1, 2, 3],
                "value": ["x", "y", "z"],
            }
        )

        result = compare_dataframes(
            checkpoint,
            current,
            page=2,
            page_size=2,
        )

        assert result.page == 2
        assert result.page_size == 2
        assert result.total_cells == 3
        assert result.total_pages == 2
        assert len(result.cells) == 1

    def test_invalid_pagination_values_raise(self):
        df = pd.DataFrame({"id": [1]})

        with pytest.raises(ValueError, match="page must be >= 1"):
            compare_dataframes(df, df, page=0)

        with pytest.raises(ValueError, match="page_size must be >= 1"):
            compare_dataframes(df, df, page_size=0)
