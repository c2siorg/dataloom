"""Integration tests for the transformation endpoint (POST /projects/{id}/transform).

These tests verify the full request-response cycle including:
- Request parsing and validation
- Database interactions
- File I/O operations
- Transformation logic execution
- Response serialization
- Error handling
"""

import csv
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import models
from app.services.project_service import create_project


def create_test_csv(upload_dir: Path, filename: str = "test_data.csv") -> Path:
    """Create a test CSV file with known data.

    Returns:
        Path to the created CSV file.
    """
    csv_path = upload_dir / filename
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age", "city"])
        writer.writerow(["Alice", "30", "New York"])
        writer.writerow(["Bob", "25", "Los Angeles"])
        writer.writerow(["Charlie", "35", "Chicago"])
        writer.writerow(["Diana", "28", "Miami"])
    return csv_path


@pytest.fixture
def test_project(client: TestClient, db: Session, tmp_path: Path):
    """Create a project with a known CSV dataset for testing.

    Returns:
        Tuple of (project_id, csv_path, initial_row_count)
    """
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()

    csv_path = create_test_csv(upload_dir)
    project = create_project(
        db=db,
        name="Test Project",
        file_path=str(csv_path),
        description="Test project for transformation endpoint",
    )

    return project.project_id, csv_path, 4  # 4 data rows


class TestTransformEndpoint:
    """Integration tests for the /projects/{id}/transform endpoint."""

    def test_filter_operation_returns_correct_rows(self, client: TestClient, test_project):
        """Test that filter operation correctly filters rows based on condition."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {
                    "column": "age",
                    "condition": ">",
                    "value": "28",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == str(project_id)
        assert data["operation_type"] == "filter"
        assert data["row_count"] == 2  # Alice (30) and Charlie (35)
        assert data["columns"] == ["name", "age", "city"]

        # Verify filtered rows have age > 28
        rows = data["rows"]
        ages = [int(row[1]) for row in rows]
        assert all(age > 28 for age in ages)

    def test_filter_operation_with_equals_condition(self, client: TestClient, test_project):
        """Test that filter operation works with equals condition for strings."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {
                    "column": "city",
                    "condition": "=",
                    "value": "New York",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == 1
        assert data["rows"][0][0] == "Alice"
        assert data["rows"][0][2] == "New York"

    def test_sort_operation_returns_correct_order(self, client: TestClient, test_project):
        """Test that sort operation correctly orders rows."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "sort",
                "sort_params": {
                    "column": "age",
                    "ascending": True,
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["operation_type"] == "sort"
        assert data["row_count"] == 4

        # Verify ascending order by age: Bob (25), Diana (28), Alice (30), Charlie (35)
        rows = data["rows"]
        ages = [int(row[1]) for row in rows]
        assert ages == [25, 28, 30, 35]

    def test_sort_operation_descending(self, client: TestClient, test_project):
        """Test that sort operation works with descending order."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "sort",
                "sort_params": {
                    "column": "age",
                    "ascending": False,
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        rows = data["rows"]
        ages = [int(row[1]) for row in rows]
        assert ages == [35, 30, 28, 25]

    def test_add_row_increases_row_count(self, client: TestClient, test_project, db: Session):
        """Test that add row operation increases the row count and persists."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "addRow",
                "row_params": {
                    "index": 2,
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["operation_type"] == "addRow"
        assert data["row_count"] == initial_row_count + 1

        # Verify the new row was added at index 2 with blank values
        rows = data["rows"]
        assert rows[2] == [" ", " ", " "]

        # Verify the change was persisted to the CSV file
        with open(csv_path) as f:
            reader = csv.reader(f)
            all_rows = list(reader)
            assert len(all_rows) == initial_row_count + 2  # +1 header + 1 new row

        # Verify transformation was logged
        statement = select(models.ProjectChangeLog).where(
            models.ProjectChangeLog.project_id == project_id
        )
        logs = db.exec(statement).all()
        assert len(logs) == 1
        assert logs[0].action_type == "addRow"

    def test_add_row_at_end(self, client: TestClient, test_project):
        """Test that add row operation works at the end of the dataset."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "addRow",
                "row_params": {
                    "index": 4,  # At the end (after 4 existing rows)
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["row_count"] == initial_row_count + 1

    def test_delete_row_removes_specific_row(self, client: TestClient, test_project, db: Session):
        """Test that delete row operation removes the specified row and persists."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "delRow",
                "row_params": {
                    "index": 1,  # Delete Bob (index 1)
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["operation_type"] == "delRow"
        assert data["row_count"] == initial_row_count - 1

        # Verify Bob was removed
        rows = data["rows"]
        names = [row[0] for row in rows]
        assert "Bob" not in names
        assert "Alice" in names
        assert "Charlie" in names
        assert "Diana" in names

        # Verify the change was persisted to the CSV file
        # initial_row_count data rows - 1 deleted row + 1 header = initial_row_count rows
        with open(csv_path) as f:
            reader = csv.reader(f)
            all_rows = list(reader)
            assert len(all_rows) == initial_row_count  # header + (initial - 1 deleted)

        # Verify transformation was logged
        statement = select(models.ProjectChangeLog).where(
            models.ProjectChangeLog.project_id == project_id
        )
        logs = db.exec(statement).all()
        assert len(logs) == 1
        assert logs[0].action_type == "delRow"

    def test_rename_column_changes_column_name(self, client: TestClient, test_project, db: Session):
        """Test that rename column operation changes the column name and persists."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "renameCol",
                "rename_col_params": {
                    "col_index": 1,  # Rename "age" column
                    "new_name": "years",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["operation_type"] == "renameCol"
        assert data["columns"] == ["name", "years", "city"]

        # Verify the change was persisted to the CSV file
        with open(csv_path) as f:
            reader = csv.reader(f)
            header = next(reader)
            assert header == ["name", "years", "city"]

        # Verify transformation was logged
        statement = select(models.ProjectChangeLog).where(
            models.ProjectChangeLog.project_id == project_id
        )
        logs = db.exec(statement).all()
        assert len(logs) == 1
        assert logs[0].action_type == "renameCol"

    def test_invalid_operation_type_returns_error(self, client: TestClient, test_project):
        """Test that invalid operation type returns appropriate error response."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "invalidOperation",
            },
        )

        # Should return 422 (validation error) or 400 (bad request)
        assert response.status_code in [400, 422]

    def test_nonexistent_project_returns_404(self, client: TestClient):
        """Test that request for nonexistent project returns 404."""
        nonexistent_id = uuid.uuid4()

        response = client.post(
            f"/projects/{nonexistent_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {
                    "column": "age",
                    "condition": ">",
                    "value": "28",
                },
            },
        )

        assert response.status_code == 404
        data = response.json()
        assert "not found" in data["detail"].lower()

    def test_filter_missing_parameters_returns_400(self, client: TestClient, test_project):
        """Test that filter operation without parameters returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "parameters required" in data["detail"].lower()

    def test_sort_missing_parameters_returns_400(self, client: TestClient, test_project):
        """Test that sort operation without parameters returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "sort",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "parameters required" in data["detail"].lower()

    def test_add_row_missing_parameters_returns_400(self, client: TestClient, test_project):
        """Test that add row operation without parameters returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "addRow",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "parameters required" in data["detail"].lower()

    def test_delete_row_missing_parameters_returns_400(self, client: TestClient, test_project):
        """Test that delete row operation without parameters returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "delRow",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "parameters required" in data["detail"].lower()

    def test_rename_column_missing_parameters_returns_400(self, client: TestClient, test_project):
        """Test that rename column operation without parameters returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "renameCol",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "parameters required" in data["detail"].lower()

    def test_filter_nonexistent_column_returns_400(self, client: TestClient, test_project):
        """Test that filter on nonexistent column returns 400."""
        project_id, csv_path, initial_row_count = test_project

        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {
                    "column": "nonexistent",
                    "condition": "=",
                    "value": "test",
                },
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert "not found" in data["detail"].lower()


class TestTransformEndpointIsolation:
    """Tests to verify that each test gets a clean project state."""

    def test_project_isolation_first_test(self, client: TestClient, test_project, db: Session):
        """First test that modifies a project."""
        project_id, csv_path, initial_row_count = test_project

        # Add a row
        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "addRow",
                "row_params": {"index": 0},
            },
        )
        assert response.status_code == 200

        # Verify the row was added
        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "sort",
                "sort_params": {"column": "age", "ascending": True},
            },
        )
        data = response.json()
        assert data["row_count"] == initial_row_count + 1

    def test_project_isolation_second_test(self, client: TestClient, test_project, db: Session):
        """Second test to verify project state is clean (previous changes not persisted)."""
        project_id, csv_path, initial_row_count = test_project

        # This test should see the original row count, not the modified one from the previous test
        response = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "sort",
                "sort_params": {"column": "age", "ascending": True},
            },
        )

        assert response.status_code == 200
        data = response.json()
        # Should have original row count (isolated from previous test)
        assert data["row_count"] == initial_row_count

        # Verify CSV file has original data
        with open(csv_path) as f:
            reader = csv.reader(f)
            all_rows = list(reader)
            assert len(all_rows) == initial_row_count + 1  # header + original data rows

        # Verify no logs from previous test
        statement = select(models.ProjectChangeLog).where(
            models.ProjectChangeLog.project_id == project_id
        )
        logs = db.exec(statement).all()
        assert len(logs) == 0
