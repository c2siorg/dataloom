"""Unit tests for the profiling API endpoint (GET /projects/{project_id}/profile)."""

import csv
import uuid
from unittest.mock import patch

import pytest

from app import models


@pytest.fixture(autouse=True)
def skip_alembic():
    """Patch out Alembic migrations so TestClient works with SQLite."""
    with patch("alembic.command.upgrade"):
        yield


@pytest.fixture
def sample_project(db, tmp_path):
    """Create a project with a valid CSV file for profiling tests."""
    csv_path = tmp_path / "profiling_test.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age", "city"])
        writer.writerow(["Alice", "30", "New York"])
        writer.writerow(["Bob", "25", "Los Angeles"])
        writer.writerow(["Charlie", "35", "Chicago"])
        writer.writerow(["Alice", "30", "New York"])  # Duplicate row

    project = models.Project(
        name="profiling_test",
        file_path=str(csv_path),
        description="Test project for profiling",
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


class TestProfileEndpointValidProject:
    """Tests for GET /projects/{project_id}/profile with a valid project."""

    def test_returns_200(self, client, sample_project):
        resp = client.get(f"/projects/{sample_project.project_id}/profile")
        assert resp.status_code == 200

    def test_response_has_summary_and_columns(self, client, sample_project):
        resp = client.get(f"/projects/{sample_project.project_id}/profile")
        data = resp.json()
        assert "summary" in data
        assert "columns" in data

    def test_summary_row_count(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert data["summary"]["row_count"] == 4

    def test_summary_column_count(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert data["summary"]["column_count"] == 3

    def test_summary_missing_count(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert data["summary"]["missing_count"] == 0

    def test_summary_duplicate_row_count(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert data["summary"]["duplicate_row_count"] == 1

    def test_summary_memory_usage_positive(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert data["summary"]["memory_usage_bytes"] > 0

    def test_column_profiles_count(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        assert len(data["columns"]) == 3

    def test_column_profile_fields(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        col = data["columns"][0]
        assert "name" in col
        assert "dtype" in col
        assert "missing_count" in col
        assert "missing_percentage" in col
        assert "unique_count" in col

    def test_numeric_column_has_numeric_stats(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        age_col = next(c for c in data["columns"] if c["name"] == "age")
        assert age_col["dtype"] == "numeric"
        assert age_col["numeric_stats"] is not None
        stats = age_col["numeric_stats"]
        assert "mean" in stats
        assert "median" in stats
        assert "std" in stats
        assert "min" in stats
        assert "max" in stats
        assert "q1" in stats
        assert "q3" in stats
        assert "skewness" in stats

    def test_categorical_column_has_categorical_stats(self, client, sample_project):
        data = client.get(f"/projects/{sample_project.project_id}/profile").json()
        name_col = next(c for c in data["columns"] if c["name"] == "name")
        assert name_col["dtype"] == "categorical"
        assert name_col["categorical_stats"] is not None
        stats = name_col["categorical_stats"]
        assert "top_values" in stats
        assert "mode" in stats


class TestProfileEndpointNotFound:
    """Tests for GET /projects/{project_id}/profile with non-existent project."""

    def test_returns_404_for_nonexistent_project(self, client):
        fake_id = uuid.uuid4()
        resp = client.get(f"/projects/{fake_id}/profile")
        assert resp.status_code == 404

    def test_404_response_has_detail(self, client):
        fake_id = uuid.uuid4()
        resp = client.get(f"/projects/{fake_id}/profile")
        data = resp.json()
        assert "detail" in data
