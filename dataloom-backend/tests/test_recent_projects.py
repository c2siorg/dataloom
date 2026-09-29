"""Tests for the dataset metadata returned by GET /projects/recent."""

import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.api.endpoints import projects
from app.services.project_service import create_project
from app.utils import pandas_helpers
from app.utils.pandas_helpers import dataset_file_stats
from app.utils.project_locks import project_write_lock


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

    def test_unchanged_file_is_not_reparsed(self, tmp_path, monkeypatch):
        path = tmp_path / "data.csv"
        path.write_text("a,b\n1,2\n3,4\n")
        parses = []
        real_read = pandas_helpers._read_and_infer

        def _counting_read(p):
            parses.append(p)
            return real_read(p)

        monkeypatch.setattr(pandas_helpers, "_read_and_infer", _counting_read)

        first = dataset_file_stats(path)
        second = dataset_file_stats(path)

        assert len(parses) == 1
        assert first == second
        assert second.row_count == 2

    def test_rewritten_file_is_reparsed(self, tmp_path):
        path = tmp_path / "data.csv"
        path.write_text("a,b\n1,2\n")
        assert dataset_file_stats(path).row_count == 1

        path.write_text("a,b\n1,2\n3,4\n5,6\n")

        stats = dataset_file_stats(path)

        assert stats.row_count == 3
        assert stats.file_size_bytes == path.stat().st_size


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

    def test_second_request_is_served_from_the_dataframe_cache(self, client, sample_csv, monkeypatch):
        uploaded = _upload(client, sample_csv, "test.csv")
        parses = []
        real_read = pandas_helpers._read_and_infer

        def _counting_read(p):
            parses.append(p)
            return real_read(p)

        monkeypatch.setattr(pandas_helpers, "_read_and_infer", _counting_read)

        first = _recent_entry(client, uploaded["project_id"])
        second = _recent_entry(client, uploaded["project_id"])

        assert len(parses) == 1
        assert first["row_count"] == second["row_count"] == 4
        client.delete(f"/projects/{uploaded['project_id']}")

    def test_stats_wait_for_an_in_flight_write(self, db, test_user, tmp_path):
        """The stats read must hold the project read lock like every other read.

        Format writers truncate the working copy in place, and dataset_file_stats
        swallows read errors, so an unlocked read landing mid-save would report
        wrong counts for the card instead of the saved file's shape.
        """
        path = tmp_path / "data.csv"
        path.write_text("value\n1\n")
        project = create_project(db, name="Locked", file_path=str(path), description="", owner_id=test_user.id)
        write_started = threading.Event()
        allow_finish = threading.Event()

        def _slow_save():
            with project_write_lock(project.project_id):
                path.write_text("")
                write_started.set()
                assert allow_finish.wait(timeout=5)
                path.write_text("value\n1\n2\n3\n")

        with ThreadPoolExecutor(max_workers=2) as executor:
            writer = executor.submit(_slow_save)
            assert write_started.wait(timeout=5)
            reader = executor.submit(projects.recent_projects, db=db, current_user=test_user)
            time.sleep(0.05)
            assert not reader.done()
            allow_finish.set()
            writer.result(timeout=5)
            result = reader.result(timeout=5)

        entry = next(p for p in result if p.project_id == project.project_id)
        assert entry.row_count == 3
        assert entry.column_count == 1
        assert entry.file_size_bytes == path.stat().st_size
