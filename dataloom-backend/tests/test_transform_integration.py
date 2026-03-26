"""Integration tests for the POST /projects/{id}/transform endpoint."""

import csv
import uuid

import pytest

from app.models import Project

CSV_CONTENT = [
    ["name", "age", "city"],
    ["Alice", "30", "New York"],
    ["Bob", "25", "Los Angeles"],
    ["Charlie", "35", "Chicago"],
    ["Diana", "28", "Houston"],
]


@pytest.fixture
def project_with_csv(db, tmp_path):
    """Create a project backed by a real CSV file in a temp directory."""
    csv_path = tmp_path / "test_data.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(CSV_CONTENT)

    project = Project(
        name="Integration Test Project",
        description="Test project for transform endpoint",
        file_path=str(csv_path),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def post_transform(client, project_id, payload):
    return client.post(f"/projects/{project_id}/transform", json=payload)


class TestFilterOperation:
    def test_filter_equals(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "filter",
                "parameters": {"column": "name", "condition": "=", "value": "Alice"},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["row_count"] == 1
        assert data["rows"][0][0] == "Alice"

    def test_filter_greater_than(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "filter",
                "parameters": {"column": "age", "condition": ">", "value": "28"},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["row_count"] == 2  # Alice (30) and Charlie (35)

    def test_filter_missing_parameters_returns_400(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "filter",
            },
        )
        assert resp.status_code == 400


class TestSortOperation:
    def test_sort_ascending(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "sort",
                "sort_params": {"column": "age", "ascending": True},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        age_col_index = data["columns"].index("age")
        ages = [row[age_col_index] for row in data["rows"]]
        assert ages == sorted(ages)

    def test_sort_descending(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "sort",
                "sort_params": {"column": "age", "ascending": False},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        age_col_index = data["columns"].index("age")
        ages = [row[age_col_index] for row in data["rows"]]
        assert ages == sorted(ages, reverse=True)


class TestAddRowOperation:
    def test_add_row_increases_count(self, client, project_with_csv):
        original_count = len(CSV_CONTENT) - 1  # exclude header
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "addRow",
                "row_params": {"index": 0},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["row_count"] == original_count + 1


class TestDeleteRowOperation:
    def test_delete_row_removes_entry(self, client, project_with_csv):
        # Row index 1 is Bob
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "delRow",
                "row_params": {"index": 1},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        name_col_index = data["columns"].index("name")
        names = [row[name_col_index] for row in data["rows"]]
        assert "Bob" not in names
        assert data["row_count"] == len(CSV_CONTENT) - 2  # minus header and deleted row


class TestRenameColumnOperation:
    def test_rename_column(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "renameCol",
                "rename_col_params": {"col_index": 0, "new_name": "full_name"},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "full_name" in data["columns"]
        assert "name" not in data["columns"]


class TestErrorCases:
    def test_invalid_operation_type_returns_422(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "notAnOperation",
            },
        )
        assert resp.status_code == 422

    def test_nonexistent_project_returns_404(self, client):
        fake_id = str(uuid.uuid4())
        resp = post_transform(
            client,
            fake_id,
            {
                "operation_type": "sort",
                "sort_params": {"column": "age", "ascending": True},
            },
        )
        assert resp.status_code == 404

    def test_response_includes_expected_fields(self, client, project_with_csv):
        resp = post_transform(
            client,
            project_with_csv.project_id,
            {
                "operation_type": "sort",
                "sort_params": {"column": "name", "ascending": True},
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "project_id" in data
        assert "operation_type" in data
        assert "row_count" in data
        assert "columns" in data
        assert "rows" in data
        assert data["operation_type"] == "sort"
