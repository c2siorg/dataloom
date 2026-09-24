"""Tests for the dataset metadata returned by GET /projects/recent."""

import json
import os
from pathlib import Path

from app.services.project_service import create_project
from app.utils.pandas_helpers import dataset_file_stats


def _upload(client, path, filename, media_type="text/csv", name="Recent Test"):
    with open(path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": (filename, f, media_type)},
            data={"projectName": name, "projectDescription": "Test"},
        )
    assert response.status_code == 200
    return response.json()


def _recent_entry(client, project_id):
    response = client.get("/projects/recent")
    assert response.status_code == 200
    return next(p for p in response.json() if p["project_id"] == project_id)


class TestDatasetFileStats:
    def test_reads_shape_through_the_format_registry(self, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5, "b": 6}]))

        stats = dataset_file_stats(path)

        assert stats.file_size_bytes == path.stat().st_size
        assert stats.row_count == 3
        assert stats.column_count == 2

    def test_missing_file_yields_null_stats(self, tmp_path):
        stats = dataset_file_stats(tmp_path / "missing.csv")

        assert stats.file_size_bytes is None
        assert stats.row_count is None
        assert stats.column_count is None

    def test_unreadable_file_keeps_size_but_null_shape(self, tmp_path):
        path = tmp_path / "broken.parquet"
        path.write_bytes(b"not a parquet file")

        stats = dataset_file_stats(path)

        assert stats.file_size_bytes == len(b"not a parquet file")
        assert stats.row_count is None
        assert stats.column_count is None


class TestRecentProjectsMetadata:
    def test_recent_projects_include_dataset_metadata(self, client, sample_csv):
        uploaded = _upload(client, sample_csv, "test.csv")

        entry = _recent_entry(client, uploaded["project_id"])

        assert entry["upload_date"] is not None
        assert entry["file_size_bytes"] == os.path.getsize(uploaded["file_path"])
        assert entry["row_count"] == 4
        assert entry["column_count"] == 3
        client.delete(f"/projects/{uploaded['project_id']}")

    def test_recent_projects_count_non_csv_formats(self, client, tmp_path):
        path = tmp_path / "data.json"
        path.write_text(json.dumps([{"x": 1, "y": 2, "z": 3}, {"x": 4, "y": 5, "z": 6}]))
        uploaded = _upload(client, path, "data.json", media_type="application/json")

        entry = _recent_entry(client, uploaded["project_id"])

        assert entry["row_count"] == 2
        assert entry["column_count"] == 3
        client.delete(f"/projects/{uploaded['project_id']}")

    def test_missing_file_does_not_fail_the_response(self, client, sample_csv):
        uploaded = _upload(client, sample_csv, "test.csv")
        Path(uploaded["file_path"]).unlink()

        entry = _recent_entry(client, uploaded["project_id"])

        assert entry["name"] == "Recent Test"
        assert entry["file_size_bytes"] is None
        assert entry["row_count"] is None
        assert entry["column_count"] is None
        client.delete(f"/projects/{uploaded['project_id']}")

    def test_unreadable_file_does_not_fail_the_response(self, client, db, test_user, tmp_path):
        path = tmp_path / "broken.xlsx"
        path.write_bytes(b"not a workbook")
        project = create_project(db, name="Broken", file_path=str(path), description="", owner_id=test_user.id)

        entry = _recent_entry(client, str(project.project_id))

        assert entry["file_size_bytes"] == len(b"not a workbook")
        assert entry["row_count"] is None
        assert entry["column_count"] is None
