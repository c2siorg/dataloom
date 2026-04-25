"""Regression tests for the save endpoint.

Ensures that saving a project never modifies the original uploaded dataset.
The original file must remain immutable as the baseline for transformation replay.
"""

import hashlib

from app.services.file_service import get_original_path


def _file_sha256(path: str) -> str:
    """Return the hex SHA-256 digest of a file's contents."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class TestSaveNeverModifiesOriginal:
    """The original dataset must remain byte-identical after any number of saves."""

    def test_original_unchanged_after_multiple_saves(self, client, sample_csv, db):
        # Upload a project
        with open(sample_csv, "rb") as f:
            resp = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Save Test", "projectDescription": "regression"},
            )
        assert resp.status_code == 200
        data = resp.json()
        project_id = data["project_id"]
        copy_path = data["file_path"]

        # Derive original path and record its hash
        original_path = str(get_original_path(copy_path))
        hash_before = _file_sha256(original_path)

        # Perform multiple saves
        for i in range(3):
            save_resp = client.post(
                f"/projects/{project_id}/save?commit_message=save-{i}",
            )
            assert save_resp.status_code == 200

        # Original file must be byte-identical
        hash_after = _file_sha256(original_path)
        assert hash_before == hash_after, "original_path was modified by a save operation"


class TestSaveWithFilterReplay:
    """Save should successfully replay and persist logged filter transformations."""

    def test_save_after_filter_keeps_filtered_rows(self, client, sample_csv):
        with open(sample_csv, "rb") as f:
            upload_resp = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Filter Save Test", "projectDescription": "filter replay"},
            )
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        filter_resp = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {"column": "name", "condition": "=", "value": "Alice"},
            },
        )
        assert filter_resp.status_code == 200
        assert len(filter_resp.json()["rows"]) == 2

        save_resp = client.post(f"/projects/{project_id}/save?commit_message=save-filter")
        assert save_resp.status_code == 200

        details_resp = client.get(f"/projects/get/{project_id}")
        assert details_resp.status_code == 200
        details = details_resp.json()
        assert details["total_rows"] == 2
        assert all(row[0] == "Alice" for row in details["rows"])
