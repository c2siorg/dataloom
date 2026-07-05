"""Tests for the add-file (append) feature.

Covers the pure append/analyze functions, the addFile replay path, and the
/projects/{id}/files endpoints end-to-end: preview, append, inventory,
undo/revert interplay, re-append, and deletion cleanup.
"""

import uuid
from pathlib import Path

import pandas as pd
import pytest

from app import models
from app.services.append_service import analyze_append, append_dataframes
from app.services.transformation_service import TransformationError, apply_add_file

BASE_CSV = b"name,age\nAlice,30\nBob,25\nCharlie,35\n"
SAME_COLS_CSV = b"name,age\nDana,40\nEve,45\n"
NEW_COLS_CSV = b"name,city\nDana,Paris\nEve,Oslo\n"
CLASH_CSV = b"name,age\nDana,forty\nEve,unknown\n"


def _upload(client, content: bytes = BASE_CSV, name: str = "base.csv"):
    response = client.post(
        "/projects/upload",
        files={"file": (name, content, "application/octet-stream")},
        data={"projectName": "Append Test", "projectDescription": "add-file tests"},
    )
    assert response.status_code == 200
    return response.json()


def _add_file(client, project_id, content: bytes, name: str = "added.csv"):
    return client.post(
        f"/projects/{project_id}/files",
        files={"file": (name, content, "application/octet-stream")},
    )


class TestAppendDataframes:
    def test_same_columns_stack(self):
        df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        new_df = pd.DataFrame({"a": [5], "b": [6]})

        combined = append_dataframes(df, new_df)

        assert list(combined.columns) == ["a", "b"]
        assert len(combined) == 3
        assert list(combined["a"]) == [1, 2, 5]

    def test_column_union_fills_nan_both_ways(self):
        df = pd.DataFrame({"a": [1], "b": [2]})
        new_df = pd.DataFrame({"b": [3], "c": [4]})

        combined = append_dataframes(df, new_df)

        assert list(combined.columns) == ["a", "b", "c"]
        assert pd.isna(combined.loc[1, "a"])  # missing in new file
        assert pd.isna(combined.loc[0, "c"])  # missing in existing data
        assert list(combined["b"]) == [2, 3]

    def test_fresh_index(self):
        df = pd.DataFrame({"a": [1, 2]})
        combined = append_dataframes(df, pd.DataFrame({"a": [3]}))
        assert list(combined.index) == [0, 1, 2]


class TestAnalyzeAppend:
    def test_alignment_report(self):
        df = pd.DataFrame({"name": ["x"], "age": [1], "city": ["y"]})
        new_df = pd.DataFrame({"name": ["z"], "email": ["e"]})

        report = analyze_append(df, new_df)

        assert report["matched_columns"] == ["name"]
        assert report["new_columns"] == ["email"]
        assert report["missing_columns"] == ["age", "city"]
        assert report["dtype_clashes"] == []
        assert report["current_row_count"] == 1
        assert report["incoming_row_count"] == 1

    def test_dtype_clash_detected(self):
        df = pd.DataFrame({"age": [30, 25]})
        new_df = pd.DataFrame({"age": ["forty", "fifty"]})

        report = analyze_append(df, new_df)

        assert report["dtype_clashes"] == [{"column": "age", "existing_dtype": "int", "incoming_dtype": "str"}]


class TestApplyAddFileReplay:
    def test_appends_stored_file(self, tmp_path):
        stored = tmp_path / "stored.csv"
        pd.DataFrame({"a": [3, 4]}).to_csv(stored, index=False)
        df = pd.DataFrame({"a": [1, 2]})

        result = apply_add_file(df, str(stored))

        assert list(result["a"]) == [1, 2, 3, 4]

    def test_missing_file_raises_transformation_error(self, tmp_path):
        with pytest.raises(TransformationError, match="missing or unreadable"):
            apply_add_file(pd.DataFrame({"a": [1]}), str(tmp_path / "gone.csv"))


class TestPreviewEndpoint:
    def test_preview_reports_alignment_without_mutating(self, client):
        project_id = _upload(client)["project_id"]

        response = client.post(
            f"/projects/{project_id}/files/preview",
            files={"file": ("new.csv", NEW_COLS_CSV, "application/octet-stream")},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["matched_columns"] == ["name"]
        assert body["new_columns"] == ["city"]
        assert body["missing_columns"] == ["age"]
        assert body["current_row_count"] == 3
        assert body["incoming_row_count"] == 2

        # Nothing stored, nothing appended.
        details = client.get(f"/projects/get/{project_id}").json()
        assert details["total_rows"] == 3
        assert client.get(f"/projects/{project_id}/files").json() == []

    def test_preview_rejects_unparseable_file(self, client):
        project_id = _upload(client)["project_id"]
        response = client.post(
            f"/projects/{project_id}/files/preview",
            files={"file": ("bad.json", b"{not valid json", "application/octet-stream")},
        )
        assert response.status_code == 400

    def test_requires_auth(self, anon_client):
        response = anon_client.post(
            "/projects/00000000-0000-0000-0000-000000000001/files/preview",
            files={"file": ("new.csv", SAME_COLS_CSV, "application/octet-stream")},
        )
        assert response.status_code == 401


class TestAddFileEndpoint:
    def test_appends_rows_and_records_inventory(self, client, db):
        project_id = _upload(client)["project_id"]

        response = _add_file(client, project_id, SAME_COLS_CSV, "feb.csv")

        assert response.status_code == 200
        body = response.json()
        assert body["total_rows"] == 5
        assert body["columns"] == ["name", "age"]

        inventory = client.get(f"/projects/{project_id}/files").json()
        assert len(inventory) == 1
        assert inventory[0]["original_filename"] == "feb.csv"

        logs = db.query(models.ProjectChangeLog).filter_by(project_id=uuid.UUID(project_id)).all()
        assert len(logs) == 1
        assert logs[0].action_type == "addFile"
        assert logs[0].action_details["add_file_params"]["rows_added"] == 2

    def test_new_columns_unioned_with_gaps(self, client):
        project_id = _upload(client)["project_id"]

        response = _add_file(client, project_id, NEW_COLS_CSV)

        body = response.json()
        assert body["columns"] == ["name", "age", "city"]
        assert body["total_rows"] == 5
        # Existing rows have no city; appended rows have no age.
        first_row, last_row = body["rows"][0], body["rows"][-1]
        assert first_row[2] is None
        assert last_row[1] is None

    def test_unparseable_file_leaves_no_trace(self, client, db):
        project_id = _upload(client)["project_id"]

        response = _add_file(client, project_id, b"{not valid json", "bad.json")

        assert response.status_code == 400
        assert client.get(f"/projects/{project_id}/files").json() == []
        assert db.query(models.ProjectChangeLog).filter_by(project_id=uuid.UUID(project_id)).count() == 0
        details = client.get(f"/projects/get/{project_id}").json()
        assert details["total_rows"] == 3

    def test_transform_endpoint_rejects_addfile(self, client):
        """addFile must not be reachable through /transform (no file path injection)."""
        project_id = _upload(client)["project_id"]
        response = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "addFile"},
        )
        assert response.status_code == 400


class TestUndoRevertInterplay:
    def test_undo_removes_appended_rows_but_keeps_inventory(self, client):
        project_id = _upload(client)["project_id"]
        _add_file(client, project_id, SAME_COLS_CSV)

        response = client.post(f"/projects/{project_id}/undo")

        assert response.status_code == 200
        assert response.json()["total_rows"] == 3
        assert len(client.get(f"/projects/{project_id}/files").json()) == 1

    def test_revert_to_checkpoint_replays_append(self, client):
        """The core replay guarantee: a checkpointed append survives revert."""
        project_id = _upload(client)["project_id"]
        _add_file(client, project_id, SAME_COLS_CSV)
        assert client.post(f"/projects/{project_id}/save", params={"commit_message": "with feb"}).status_code == 200
        checkpoint_id = client.get(f"/logs/checkpoints/{project_id}").json()[0]["id"]

        response = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": checkpoint_id})

        assert response.status_code == 200
        assert response.json()["total_rows"] == 5

    def test_reappend_after_full_revert(self, client):
        project_id = _upload(client)["project_id"]
        _add_file(client, project_id, SAME_COLS_CSV)

        assert client.post(f"/projects/{project_id}/revert").json()["total_rows"] == 3

        file_id = client.get(f"/projects/{project_id}/files").json()[0]["id"]
        response = client.post(f"/projects/{project_id}/files/{file_id}/append")

        assert response.status_code == 200
        assert response.json()["total_rows"] == 5

    def test_reappend_unknown_file_404(self, client):
        project_id = _upload(client)["project_id"]
        response = client.post(f"/projects/{project_id}/files/00000000-0000-0000-0000-000000000001/append")
        assert response.status_code == 404


class TestDeleteCleanup:
    def test_delete_project_removes_inventory_rows_and_files(self, client, db):
        project_id = _upload(client)["project_id"]
        _add_file(client, project_id, SAME_COLS_CSV)
        stored_path = Path(db.query(models.ProjectFile).filter_by(project_id=uuid.UUID(project_id)).one().file_path)
        assert stored_path.exists()

        response = client.delete(f"/projects/{project_id}")

        assert response.status_code == 200
        assert db.query(models.ProjectFile).filter_by(project_id=uuid.UUID(project_id)).count() == 0
        assert not stored_path.exists()
