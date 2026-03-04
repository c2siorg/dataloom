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
        assert hash_before == hash_after, (
            "original_path was modified by a save operation"
        )
