"""Tests for the dataset comparison service."""

import numpy as np
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

    @pytest.mark.parametrize("missing", [None, float("nan"), pd.NA, pd.NaT, np.float64("nan")])
    def test_equivalent_missing_scalars_are_equal(self, missing):
        result = compare_dataframes(
            pd.DataFrame({"value": [missing]}),
            pd.DataFrame({"value": [None]}),
        )
        assert result.total_cells == 0

    def test_nested_json_values_compare_structurally_and_serialize(self):
        before = {"a": [1, {"b": None}], "same": True}
        after = {"a": [1.0, {"b": pd.NA}], "same": True}
        result = compare_dataframes(pd.DataFrame({"value": [before]}), pd.DataFrame({"value": [after]}))
        assert result.total_cells == 0

        changed = compare_dataframes(
            pd.DataFrame({"value": [[1, 2]]}),
            pd.DataFrame({"value": [[1, 3]]}),
        )
        assert changed.cells[0]["checkpoint_value"] == [1, 2]
        assert changed.cells[0]["current_value"] == [1, 3]

        bool_change = compare_dataframes(
            pd.DataFrame({"value": [{"enabled": True}]}),
            pd.DataFrame({"value": [{"enabled": 1}]}),
        )
        assert bool_change.total_cells == 1

    def test_array_like_values_are_rejected_without_ambiguous_truth_checks(self):
        checkpoint = pd.DataFrame({"value": [np.array([1, 2])]})
        current = pd.DataFrame({"value": [np.array([1, 2])]})

        with pytest.raises(ValueError, match="Unsupported comparison value type: ndarray"):
            compare_dataframes(checkpoint, current)

    def test_identifier_numeric_normalization_and_reordered_rows(self):
        checkpoint = pd.DataFrame({"id": pd.Series([1, 2, 3], dtype="int64"), "value": ["a", "b", "c"]})
        current = pd.DataFrame({"id": [3.0, 1.0, 2.0], "value": ["c", "a", "B"]}, index=[8, 4, 10])

        result = compare_dataframes(checkpoint, current, match_column="id")

        assert result.total_rows == 0
        assert result.cells == [
            {
                "row": 2.0,
                "column": "value",
                "checkpoint_value": "b",
                "current_value": "B",
            }
        ]

    @pytest.mark.parametrize(
        ("checkpoint_ids", "current_ids"),
        [([1, 1], [1, 2]), ([1, 2], [1.0, 1.0]), ([None, 2], [1, 2])],
    )
    def test_identifier_duplicate_or_missing_keys_are_rejected(self, checkpoint_ids, current_ids):
        with pytest.raises(ValueError, match="unique values|non-missing"):
            compare_dataframes(
                pd.DataFrame({"id": checkpoint_ids}),
                pd.DataFrame({"id": current_ids}),
                match_column="id",
            )

    def test_duplicate_column_names_are_rejected(self):
        checkpoint = pd.DataFrame([[1, 2]], columns=["id", "id"])
        current = pd.DataFrame({"id": [1]})
        with pytest.raises(ValueError, match="Duplicate dataset column names"):
            compare_dataframes(checkpoint, current)

    def test_comparison_does_not_construct_row_series(self, monkeypatch):
        def fail_on_iloc(_self):
            raise AssertionError("comparison must not use iloc row-Series access")

        monkeypatch.setattr(pd.DataFrame, "iloc", property(fail_on_iloc))
        result = compare_dataframes(pd.DataFrame({"value": [1]}), pd.DataFrame({"value": [2]}))
        assert result.total_cells == 1

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
                "id": [1, 2, 3, 4, 5, 6],
                "value": ["a", "b", "c", "d", "e", "f"],
            }
        )

        second_row_page = compare_dataframes(
            checkpoint,
            current,
            row_page=2,
            cell_page=1,
            page_size=2,
        )

        assert second_row_page.row_page == 2
        assert second_row_page.cell_page == 1
        assert second_row_page.page_size == 2
        assert second_row_page.total_rows == 3
        assert second_row_page.total_cells == 0
        assert second_row_page.total_row_pages == 2
        assert second_row_page.total_cell_pages == 1
        assert len(second_row_page.rows) == 1
        assert second_row_page.cells == []

        changed_current = pd.DataFrame({"id": [1, 2, 3], "value": ["x", "y", "z"]})
        second_cell_page = compare_dataframes(
            checkpoint,
            changed_current,
            row_page=1,
            cell_page=2,
            page_size=2,
        )

        assert second_cell_page.row_page == 1
        assert second_cell_page.cell_page == 2
        assert second_cell_page.total_rows == 0
        assert second_cell_page.total_row_pages == 1
        assert second_cell_page.rows == []
        assert len(second_cell_page.cells) == 1

    def test_invalid_pagination_values_raise(self):
        df = pd.DataFrame({"id": [1]})

        with pytest.raises(ValueError, match="row_page must be >= 1"):
            compare_dataframes(df, df, row_page=0)

        with pytest.raises(ValueError, match="cell_page must be >= 1"):
            compare_dataframes(df, df, cell_page=0)

        with pytest.raises(ValueError, match="page_size must be >= 1"):
            compare_dataframes(df, df, page_size=0)
