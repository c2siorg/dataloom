"""Tests for dtype mapping and dataframe_to_response dtypes field."""

import random
import uuid

import pandas as pd
import pytest

from app import models
from app.services.transformation_service import apply_metadata_transformation
from app.utils.pandas_helpers import (
    _DATETIME_SAMPLE_SIZE,
    _infer_datetime_columns,
    _sample_rules_out_datetime,
    dataframe_to_response,
    map_dtype,
    restore_semantic_dtypes,
)


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [30, 25, 35],
            "city": ["New York", "Los Angeles", "Chicago"],
        }
    )


class TestMapDtype:
    def test_int_column(self, sample_df):
        assert map_dtype(sample_df["age"].dtype) == "int"

    def test_float_column(self):
        df = pd.DataFrame({"val": [1.5, 2.7]})
        assert map_dtype(df["val"].dtype) == "float"

    def test_str_column(self, sample_df):
        assert map_dtype(sample_df["name"].dtype) == "str"

    def test_bool_column(self):
        df = pd.DataFrame({"val": [True, False]})
        assert map_dtype(df["val"].dtype) == "bool"

    def test_datetime_column(self):
        df = pd.DataFrame({"val": pd.to_datetime(["2024-01-01", "2024-06-15"])})
        assert map_dtype(df["val"].dtype) == "datetime"


class TestSemanticDtypeRestoration:
    def test_restores_all_null_string_column_as_nullable_string(self):
        loaded = pd.DataFrame({"label": [float("nan"), float("nan")], "count": [1.0, 2.0]})

        restored = restore_semantic_dtypes(loaded, {"label": "str", "count": "int"})

        assert str(restored["label"].dtype) == "string"
        assert restored["label"].isna().all()
        assert str(restored["count"].dtype) == "Int64"

    def test_rejects_values_that_cannot_be_safely_restored(self):
        loaded = pd.DataFrame({"count": [1, "not an integer"]})
        restored = restore_semantic_dtypes(loaded, {"count": "int"})

        assert restored["count"].tolist() == [1, "not an integer"]
        assert restored["count"].dtype == loaded["count"].dtype

    def test_ignores_missing_and_extra_metadata_and_unknown_dtype(self, monkeypatch):
        loaded = pd.DataFrame({"count": [1, 2]})
        warnings = []
        monkeypatch.setattr("app.utils.pandas_helpers.logger.warning", lambda *args, **kwargs: warnings.append(args))

        restored = restore_semantic_dtypes(loaded, {"removed": "str", "count": "decimal-ish"})

        assert restored is loaded
        assert restored["count"].tolist() == [1, 2]
        assert warnings

    def test_invalid_datetime_metadata_does_not_turn_numbers_into_epoch_dates(self):
        loaded = pd.DataFrame({"value": [1, 2]})

        restored = restore_semantic_dtypes(loaded, {"value": "datetime"})

        assert restored["value"].tolist() == [1, 2]
        assert not pd.api.types.is_datetime64_any_dtype(restored["value"])

    def test_restores_supported_nullable_types_without_changing_values(self):
        loaded = pd.DataFrame(
            {
                "text": ["a", None],
                "count": [1.0, float("nan")],
                "ratio": [1.5, float("nan")],
                "active": [True, None],
                "when": ["2024-01-02", None],
            }
        )

        restored = restore_semantic_dtypes(
            loaded,
            {"text": "str", "count": "int", "ratio": "float", "active": "bool", "when": "datetime"},
        )

        assert restored["text"].iloc[0] == "a" and pd.isna(restored["text"].iloc[1])
        assert str(restored["text"].dtype) == "string"
        assert restored["count"].iloc[0] == 1 and pd.isna(restored["count"].iloc[1])
        assert str(restored["count"].dtype) == "Int64"
        assert restored["ratio"].iloc[0] == 1.5 and pd.isna(restored["ratio"].iloc[1])
        assert str(restored["ratio"].dtype) == "Float64"
        assert bool(restored["active"].iloc[0]) is True and pd.isna(restored["active"].iloc[1])
        assert str(restored["active"].dtype) == "boolean"
        assert restored["when"].iloc[0] == pd.Timestamp("2024-01-02")
        assert pd.isna(restored["when"].iloc[1])

    def test_does_not_copy_or_convert_already_restored_columns(self):
        loaded = pd.DataFrame({"value": pd.Series([1, pd.NA], dtype="Int64")})

        restored = restore_semantic_dtypes(loaded, {"value": "int"})

        assert restored is loaded

    def test_normalizes_non_string_column_labels(self):
        restored = restore_semantic_dtypes(pd.DataFrame({1: [None]}), {"1": "str"})

        assert str(restored[1].dtype) == "string"

    def test_project_reload_restores_all_null_semantic_string(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("nulls.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Null dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uploaded.json()["project_id"]
        row = (
            db.query(models.ProjectColumnMetadata)
            .filter_by(project_id=uuid.UUID(project_id), column_name="label")
            .one()
        )
        row.column_dtype = "str"
        db.commit()

        response = client.get(f"/projects/get/{project_id}")

        assert response.status_code == 200, response.text
        assert response.json()["dtypes"]["label"] == "str"
        assert response.json()["rows"] == [[None], [None]]

    def test_cast_updates_semantic_dtype_across_reload_and_undo(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("numeric-text.csv", b"value\n10\n20\n", "text/csv")},
            data={"projectName": "Cast semantic dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="value").one()
        row.column_dtype = "str"
        db.commit()

        cast = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "castDataType",
                "cast_data_type_params": {"column": "value", "target_type": "float"},
            },
        )

        assert cast.status_code == 200, cast.text
        assert cast.json()["dtypes"]["value"] == "float"
        assert (
            db.query(models.ProjectColumnMetadata)
            .filter_by(project_id=project_id, column_name="value")
            .one()
            .column_dtype
            == "float"
        )
        assert client.get(f"/projects/get/{project_id}").json()["dtypes"]["value"] == "float"

        undone = client.post(f"/projects/{project_id}/undo")

        assert undone.status_code == 200, undone.text
        assert undone.json()["dtypes"]["value"] == "str"
        assert undone.json()["rows"] == [["10"], ["20"]]

    def test_metadata_initialization_failure_removes_upload_and_project(self, client, db, monkeypatch):
        from app.api.endpoints import projects

        original_store = projects.store_upload
        stored_paths = []

        def tracked_store(file):
            paths = original_store(file)
            stored_paths.extend(paths)
            return paths

        def fail_metadata(*_args, **_kwargs):
            raise RuntimeError("metadata insert failed")

        monkeypatch.setattr(projects, "store_upload", tracked_store)
        monkeypatch.setattr(projects, "create_project_column_metadata", fail_metadata)
        projects_before = db.query(models.Project).count()

        with pytest.raises(RuntimeError, match="metadata insert failed"):
            client.post(
                "/projects/upload",
                files={"file": ("upload-failure.csv", b"label\ntext\n", "text/csv")},
                data={"projectName": "No orphan", "projectDescription": "test"},
            )

        assert db.query(models.Project).count() == projects_before
        assert stored_paths
        assert all(not path.exists() for path in stored_paths)

    def test_checkpoint_revert_restores_semantic_dtype_snapshot(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("checkpoint.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Checkpoint dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").one()
        row.column_dtype = "str"
        db.commit()

        renamed = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "renameCol", "rename_col_params": {"col_index": 0, "new_name": "renamed"}},
        )
        assert renamed.status_code == 200, renamed.text
        saved = client.post(f"/projects/{project_id}/save", params={"commit_message": "string checkpoint"})
        assert saved.status_code == 200, saved.text
        checkpoint = db.query(models.Checkpoint).filter_by(project_id=project_id).one()
        assert checkpoint.metadata_snapshot == {"renamed": "str"}

        cast = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "castDataType",
                "cast_data_type_params": {"column": "renamed", "target_type": "float"},
            },
        )
        assert cast.status_code == 200, cast.text

        reverted = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": str(checkpoint.id)})

        assert reverted.status_code == 200, reverted.text
        assert reverted.json()["dtypes"]["renamed"] == "str"
        assert reverted.json()["rows"] == [[None], [None]]

    def test_legacy_project_backfills_metadata_before_undoable_change(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("legacy.csv", b"name,age\nA,20\n", "text/csv")},
            data={"projectName": "Legacy metadata", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).delete()
        db.commit()

        changed = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "addRow", "row_params": {"index": 0}},
        )

        assert changed.status_code == 200, changed.text
        backfilled = {
            row.column_name: row.column_dtype
            for row in db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).all()
        }
        assert backfilled == {"name": "str", "age": "int"}
        assert client.post(f"/projects/{project_id}/undo").status_code == 200
        assert {
            row.column_name: row.column_dtype
            for row in db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).all()
        } == backfilled
        assert client.post(f"/projects/{project_id}/redo").status_code == 200

    def test_incomplete_metadata_write_path_preserves_persisted_semantics(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("partial.csv", b"label,count\nNaN,1\nNaN,2\n", "text/csv")},
            data={"projectName": "Partial metadata", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="count").delete()
        db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").update(
            {"column_dtype": "str"}
        )
        db.commit()

        changed = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "addRow", "row_params": {"index": 0}},
        )

        assert changed.status_code == 200, changed.text
        metadata = {
            row.column_name: row.column_dtype
            for row in db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).all()
        }
        assert metadata == {"label": "str", "count": "int"}
        assert changed.json()["dtypes"] == {"label": "str", "count": "int"}

    def test_project_get_infers_legacy_metadata_without_writing(self, client, db, monkeypatch):
        from concurrent.futures import ThreadPoolExecutor

        from app.api.endpoints import projects

        uploaded = client.post(
            "/projects/upload",
            files={"file": ("legacy-read.csv", b"label,count\ntext,1\n", "text/csv")},
            data={"projectName": "Legacy read", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        original = {"label": "str"}
        db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).delete()
        db.add(models.ProjectColumnMetadata(project_id=project_id, column_name="label", column_dtype="str"))
        db.commit()

        def fail_write(*_args, **_kwargs):
            raise AssertionError("a GET must not write metadata")

        monkeypatch.setattr(projects, "replace_project_column_metadata", fail_write)
        monkeypatch.setattr(projects, "get_project_column_metadata", lambda *_args: original)
        response = client.get(f"/projects/get/{project_id}")

        assert response.status_code == 200, response.text
        assert response.json()["dtypes"] == {"label": "str", "count": "int"}
        project = db.get(models.Project, project_id)

        def concurrent_read():
            return projects.get_project_details(page=1, pageSize=50, db=object(), project=project)

        with ThreadPoolExecutor(max_workers=4) as executor:
            responses = list(executor.map(lambda _index: concurrent_read(), range(8)))

        assert all(result["dtypes"] == {"label": "str", "count": "int"} for result in responses)
        assert {
            row.column_name: row.column_dtype
            for row in db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).all()
        } == original

    def test_reset_restores_upload_time_semantic_dtype(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("reset-null.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Reset dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        project = db.get(models.Project, project_id)
        project.original_column_metadata = {"label": "str"}
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").one()
        row.column_dtype = "float"
        db.commit()

        reset = client.post(f"/projects/{project_id}/reset")

        assert reset.status_code == 200, reset.text
        assert reset.json()["dtypes"]["label"] == "str"
        assert reset.json()["rows"] == [[None], [None]]
        assert db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id).one().column_dtype == "str"

    def test_legacy_undo_redo_without_metadata_snapshots_preserves_semantic_dtype(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("legacy-undo.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Legacy undo dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        project = db.get(models.Project, project_id)
        project.original_column_metadata = None
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").one()
        row.column_dtype = "str"
        db.commit()

        changed = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "addRow", "row_params": {"index": 0}},
        )
        assert changed.status_code == 200, changed.text
        step = db.query(models.UndoStep).filter_by(project_id=project_id).one()
        step.metadata_before = None
        step.metadata_after = None
        db.commit()

        undone = client.post(f"/projects/{project_id}/undo")
        assert undone.status_code == 200, undone.text
        assert undone.json()["dtypes"]["label"] == "str"
        assert (
            db.query(models.ProjectColumnMetadata)
            .filter_by(project_id=project_id, column_name="label")
            .one()
            .column_dtype
            == "str"
        )

        redone = client.post(f"/projects/{project_id}/redo")
        assert redone.status_code == 200, redone.text
        assert redone.json()["dtypes"]["label"] == "str"
        assert (
            db.query(models.ProjectColumnMetadata)
            .filter_by(project_id=project_id, column_name="label")
            .one()
            .column_dtype
            == "str"
        )

    def test_revert_uses_upload_metadata_when_checkpoint_snapshot_is_missing(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("legacy-checkpoint.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Legacy checkpoint dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        project = db.get(models.Project, project_id)
        project.original_column_metadata = {"label": "str"}
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").one()
        row.column_dtype = "str"
        db.commit()
        saved = client.post(f"/projects/{project_id}/save", params={"commit_message": "original strings"})
        assert saved.status_code == 200, saved.text
        checkpoint = db.query(models.Checkpoint).filter_by(project_id=project_id).one()
        checkpoint.metadata_snapshot = None
        db.commit()

        cast = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "castDataType",
                "cast_data_type_params": {"column": "label", "target_type": "float"},
            },
        )
        assert cast.status_code == 200, cast.text

        reverted = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": str(checkpoint.id)})

        assert reverted.status_code == 200, reverted.text
        assert reverted.json()["dtypes"]["label"] == "str"
        assert reverted.json()["rows"] == [[None], [None]]

        checkpoint.metadata_snapshot = ["malformed"]
        db.commit()
        cast_again = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "castDataType",
                "cast_data_type_params": {"column": "label", "target_type": "float"},
            },
        )
        assert cast_again.status_code == 200, cast_again.text
        reverted_again = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": str(checkpoint.id)})
        assert reverted_again.status_code == 200, reverted_again.text
        assert reverted_again.json()["dtypes"]["label"] == "str"

    def test_reset_legacy_project_uses_persisted_semantic_metadata(self, client, db):
        uploaded = client.post(
            "/projects/upload",
            files={"file": ("legacy-reset.csv", b"label\nNaN\nNaN\n", "text/csv")},
            data={"projectName": "Legacy reset dtype", "projectDescription": "test"},
        )
        assert uploaded.status_code == 200, uploaded.text
        project_id = uuid.UUID(uploaded.json()["project_id"])
        project = db.get(models.Project, project_id)
        project.original_column_metadata = None
        db.commit()
        changed = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "castDataType",
                "cast_data_type_params": {"column": "label", "target_type": "float"},
            },
        )
        assert changed.status_code == 200, changed.text
        row = db.query(models.ProjectColumnMetadata).filter_by(project_id=project_id, column_name="label").one()
        row.column_dtype = "str"
        db.commit()

        reset = client.post(f"/projects/{project_id}/reset")

        assert reset.status_code == 200, reset.text
        assert reset.json()["dtypes"]["label"] == "str"
        assert (
            db.query(models.ProjectColumnMetadata)
            .filter_by(project_id=project_id, column_name="label")
            .one()
            .column_dtype
            == "str"
        )


class TestMetadataReconciliation:
    def test_rename_moves_semantic_dtype(self):
        before = pd.DataFrame({"old": pd.Series([None, None], dtype="string")})
        after = before.rename(columns={"old": "new"})

        result = apply_metadata_transformation(
            {"old": "str"},
            "renameCol",
            {"rename_col_params": {"col_index": 0, "new_name": "new"}},
            before,
            after,
        )

        assert result == {"new": "str"}

    def test_add_empty_column_uses_established_string_semantics(self):
        before = pd.DataFrame({"id": [1]})
        after = before.assign(label=None)

        result = apply_metadata_transformation(
            {"id": "int"},
            "addCol",
            {"add_col_params": {"index": 1, "name": "label"}},
            before,
            after,
        )

        assert result == {"id": "int", "label": "str"}

    def test_fill_updates_semantic_dtype_when_all_null_string_becomes_numeric(self):
        before = pd.DataFrame({"value": pd.Series([None, None], dtype="string")})
        after = pd.DataFrame({"value": [1.0, 2.0]})

        result = apply_metadata_transformation(
            {"value": "str"},
            "fillEmpty",
            {"fill_empty_params": {"fill_value": 1, "index": 0, "strategy": "custom"}},
            before,
            after,
        )

        assert result == {"value": "float"}

    def test_melt_reconciles_schema_and_removes_stale_column_metadata(self):
        before = pd.DataFrame({"id": [1, 2], "left": ["a", "b"], "right": ["c", "d"]})
        after = before.melt(id_vars=["id"], var_name="variable", value_name="value")

        result = apply_metadata_transformation(
            {"id": "int", "left": "str", "right": "str"},
            "melt",
            {"melt_params": {"id_vars": ["id"], "value_vars": ["left", "right"]}},
            before,
            after,
        )

        assert set(result) == {"id", "variable", "value"}
        assert result == {"id": "int", "variable": "str", "value": "str"}


class TestDataframeToResponse:
    def test_includes_dtypes(self, sample_df):
        response = dataframe_to_response(sample_df)
        assert "dtypes" in response
        assert response["dtypes"]["name"] == "str"
        assert response["dtypes"]["age"] == "int"
        assert response["dtypes"]["city"] == "str"

    def test_dtypes_with_mixed_types(self):
        df = pd.DataFrame(
            {
                "id": [1, 2],
                "score": [9.5, 8.3],
                "active": [True, False],
                "label": ["a", "b"],
            }
        )
        response = dataframe_to_response(df)
        assert response["dtypes"]["id"] == "int"
        assert response["dtypes"]["score"] == "float"
        assert response["dtypes"]["active"] == "bool"
        assert response["dtypes"]["label"] == "str"

    def test_still_includes_columns_rows_row_count(self, sample_df):
        response = dataframe_to_response(sample_df)
        assert response["columns"] == ["name", "age", "city"]
        assert response["row_count"] == 3
        assert len(response["rows"]) == 3

    def test_preserves_nulls_without_coercing_them_to_empty_strings(self):
        df = pd.DataFrame(
            {
                "maybe_missing": [None, ""],
                "score": [float("inf"), 5.5],
                "when": pd.to_datetime(["2024-01-01", None]),
            }
        )

        response = dataframe_to_response(df)

        assert response["rows"][0][0] is None
        assert response["rows"][1][0] == ""
        assert response["rows"][0][1] is None
        assert response["rows"][1][1] == 5.5
        assert response["rows"][0][2] == "2024-01-01"
        assert response["rows"][1][2] is None

    def test_preserves_non_scalar_cells_without_isna_truthiness_errors(self):
        df = pd.DataFrame(
            {
                "payload": [[1, 2], [None], {"ok": True}],
            }
        )

        response = dataframe_to_response(df)

        assert response["rows"][0][0] == [1, 2]
        assert response["rows"][1][0] == [None]
        assert response["rows"][2][0] == {"ok": True}


class TestInferDatetimeColumns:
    def test_converts_valid_datetime_column(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10",
                    "2024-02-11",
                    "2024-03-12",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result.at[0, "created_at"] == pd.Timestamp("2024-01-10")

    def test_supports_mixed_datetime_formats(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10",
                    "11/02/2024",
                    "March 12, 2024",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])

    def test_does_not_convert_bare_years(self):
        df = pd.DataFrame(
            {
                "grad_year": [
                    "2024",
                    "2025",
                    "2023",
                    "2022",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["grad_year"])
        assert result["grad_year"].tolist() == [
            "2024",
            "2025",
            "2023",
            "2022",
        ]

    def test_does_not_convert_numeric_ids(self):
        df = pd.DataFrame(
            {
                "student_id": [
                    "20240101",
                    "20240102",
                    "20240103",
                    "20240104",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["student_id"])
        assert result["student_id"].tolist() == [
            "20240101",
            "20240102",
            "20240103",
            "20240104",
        ]

    def test_does_not_convert_short_codes(self):
        df = pd.DataFrame(
            {
                "code": [
                    "A123",
                    "B456",
                    "C789",
                    "D012",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["code"])

    def test_does_not_convert_partial_dates(self):
        df = pd.DataFrame(
            {
                "period": [
                    "2024-01",
                    "2024-02",
                    "2024-03",
                    "2024-04",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["period"])

    def test_converts_at_exact_eighty_percent_threshold(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "2024-04-01",
                    "invalid",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["event_date"])
        assert pd.isna(result.at[4, "event_date"])

    def test_does_not_convert_below_eighty_percent_threshold(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "invalid",
                    "also-invalid",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_does_not_convert_when_date_shaped_values_are_invalid(self):
        df = pd.DataFrame(
            {
                "event_date": [
                    "2024-13-01",
                    "2024-14-02",
                    "2024-15-03",
                    "2024-01-01",
                    "2024-02-01",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_does_not_mutate_original_dataframe(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-01",
                    "2024-02-01",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(df["created_at"])
        assert df["created_at"].tolist() == [
            "2024-01-01",
            "2024-02-01",
        ]

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result["created_at"].tolist() == [
            pd.Timestamp("2024-01-01"),
            pd.Timestamp("2024-02-01"),
        ]

    def test_does_not_convert_mixed_type_object_column(self):
        df = pd.DataFrame(
            {
                "value": [
                    "2024-01-01",
                    "2024-02-01",
                    "2024-03-01",
                    "2024-04-01",
                    123,
                ]
            },
            dtype=object,
        )

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["value"])
        assert result["value"].tolist() == [
            "2024-01-01",
            "2024-02-01",
            "2024-03-01",
            "2024-04-01",
            123,
        ]

    def test_converts_datetime_values_with_time(self):
        df = pd.DataFrame(
            {
                "created_at": [
                    "2024-01-10 10:30:00",
                    "2024-02-11 11:45:30",
                    "2024-03-12T12:15:00",
                ]
            }
        )

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["created_at"])
        assert result.at[0, "created_at"] == pd.Timestamp("2024-01-10 10:30:00")


def _dates(count, start="2024-01-01"):
    return [str(day.date()) for day in pd.date_range(start, periods=count, freq="D")]


def _notes(count):
    return [f"note {index}" for index in range(count)]


class TestSampledPreGate:
    """Columns larger than the sample size take the pre-gate path.

    The existing TestInferDatetimeColumns cases all use a handful of rows, so
    they bypass the gate entirely. These use more rows than the sample size.
    """

    def test_large_text_column_stays_text(self):
        df = pd.DataFrame({"notes": _notes(5000)})

        result = _infer_datetime_columns(df)

        assert result["notes"].dtype == df["notes"].dtype
        assert not pd.api.types.is_datetime64_any_dtype(result["notes"])

    def test_large_date_column_still_converts(self):
        df = pd.DataFrame({"event_date": _dates(5000)})

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_converts_at_exact_threshold_when_shuffled(self):
        values = _dates(4000) + _notes(1000)
        random.Random(0).shuffle(values)
        df = pd.DataFrame({"event_date": values})

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_does_not_convert_just_below_threshold(self):
        values = _dates(3950) + _notes(1050)
        random.Random(0).shuffle(values)
        df = pd.DataFrame({"event_date": values})

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_converts_when_junk_is_clustered_at_the_top(self):
        # A head-based sample would see only notes and wrongly reject.
        df = pd.DataFrame({"event_date": _notes(1000) + _dates(4000)})

        result = _infer_datetime_columns(df)

        assert pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_large_mixed_type_column_stays_object(self):
        df = pd.DataFrame({"value": [*_dates(5000), 123]})

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["value"])
        assert result.at[5000, "value"] == 123

    def test_large_column_with_both_date_conventions_stays_text(self):
        values = ["13/01/2024", "01/13/2024"] * 2500
        df = pd.DataFrame({"event_date": values})

        result = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result["event_date"])

    def test_inference_is_deterministic_across_calls(self):
        values = _dates(4000) + _notes(1000)
        random.Random(0).shuffle(values)
        df = pd.DataFrame({"event_date": values, "notes": _notes(5000)})

        first = _infer_datetime_columns(df)
        second = _infer_datetime_columns(df)

        assert first.dtypes.to_dict() == second.dtypes.to_dict()

    def test_rare_conflicting_conventions_yield_same_result_as_bypassed_gate(self, monkeypatch):
        values = ["05/06/2024"] * 5000 + ["13/01/2024", "01/13/2024"]
        random.Random(0).shuffle(values)
        df = pd.DataFrame({"event_date": values})

        result_with_gate = _infer_datetime_columns(df)

        monkeypatch.setattr("app.utils.pandas_helpers._sample_rules_out_datetime", lambda x: False)
        result_without_gate = _infer_datetime_columns(df)

        assert not pd.api.types.is_datetime64_any_dtype(result_with_gate["event_date"])
        assert result_with_gate["event_date"].tolist() == result_without_gate["event_date"].tolist()
        assert result_with_gate.dtypes.to_dict() == result_without_gate.dtypes.to_dict()


class TestSampleRulesOutDatetime:
    def test_small_column_is_never_ruled_out(self):
        non_null = pd.Series(_notes(_DATETIME_SAMPLE_SIZE))

        assert _sample_rules_out_datetime(non_null) is False

    def test_large_text_column_is_ruled_out(self):
        assert _sample_rules_out_datetime(pd.Series(_notes(5000))) is True

    def test_large_date_column_is_not_ruled_out(self):
        assert _sample_rules_out_datetime(pd.Series(_dates(5000))) is False

    def test_non_string_values_rule_the_column_out(self):
        non_null = pd.Series([*_dates(5000), *range(5000)])

        assert _sample_rules_out_datetime(non_null) is True

    def test_conflicting_date_conventions_rule_the_column_out(self):
        non_null = pd.Series(["13/01/2024", "01/13/2024"] * 2500)

        assert _sample_rules_out_datetime(non_null) is True
