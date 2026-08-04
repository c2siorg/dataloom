"""HTTP semantics tests for the transform endpoint."""

import csv

import pytest
from fastapi import HTTPException

from app.utils.pandas_helpers import read_table_safe


@pytest.fixture
def project(client, sample_csv):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "HTTP Semantics", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def project_id(project):
    return project["project_id"]


@pytest.fixture
def pagination_project(client, tmp_path):
    """Create a project with 101 rows for pagination testing."""
    csv_path = tmp_path / "pagination_data.csv"

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age"])

        for i in range(101):
            writer.writerow([f"User {i}", i])

    with open(csv_path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("pagination_data.csv", f, "text/csv")},
            data={
                "projectName": "Pagination Test",
                "projectDescription": "Pagination fixture",
            },
        )

    assert response.status_code == 200, response.text
    return response.json()


def test_transform_preserves_http_exception_status(client, project_id):
    # Missing filter params should return the explicit 400 from endpoint validation.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "filter"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Filter parameters required"


def test_transform_maps_transformation_error_to_400(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "missing_column", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_transform_redacts_file_not_found_path_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(status_code=404, detail="File not found: /tmp/private/uploads/project.csv")

    monkeypatch.setattr(transformations_endpoint, "read_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


def test_transform_redacts_internal_http_exception_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(
            status_code=500,
            detail="Error reading CSV: [Errno 13] Permission denied: /tmp/private/uploads/project.csv",
        )

    monkeypatch.setattr(transformations_endpoint, "read_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"


def test_transform_redacts_sensitive_transformation_error_message(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise transformations_endpoint.ts.TransformationError(
            "SQL failure: SELECT * FROM users WHERE password = 'secret'"
        )

    monkeypatch.setattr(transformations_endpoint.ts, "apply_filter", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid transformation request"


@pytest.mark.parametrize(
    "add_col_params",
    [
        {"index": 1},
        {"index": 1, "name": None},
        {"index": 1, "name": "   "},
    ],
)
def test_transform_add_col_without_valid_name_returns_422(client, project_id, add_col_params):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "addCol", "add_col_params": add_col_params},
    )

    assert response.status_code == 422


def test_transform_drop_duplicate_keep_true_returns_422(client, project_id):
    # keep=True passes schema typing (DropDup | bool) but pandas rejects it;
    # it must be a clean 422, not an Internal server error 500.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "dropDuplicate", "drop_duplicate": {"columns": "name", "keep": True}},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("keep", ["first", "last", False])
def test_transform_drop_duplicate_valid_keep_succeeds(client, project_id, keep):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "dropDuplicate", "drop_duplicate": {"columns": "name", "keep": keep}},
    )

    assert response.status_code == 200, response.text


def test_transform_returns_500_on_unexpected_exception(client, project_id, monkeypatch):
    # Patch the endpoint's imported service module to force an unexpected crash.
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(transformations_endpoint.ts, "apply_filter", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"


def test_transform_returns_500_on_unexpected_exception_during_persistence(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    calls = []

    def boom(*args, **kwargs):
        calls.append((args, kwargs))
        raise RuntimeError("disk error")

    # This path runs only for mutating operations (should_save=True).
    monkeypatch.setattr(transformations_endpoint, "save_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"
    assert calls, "save_table_safe was never called; persistence path may not have been exercised"


def test_transform_reverts_file_if_log_transformation_fails(client, project, monkeypatch):
    project_id = project["project_id"]
    file_path = project["file_path"]
    original_df = read_table_safe(file_path)

    from app.services import project_service

    def boom(*args, **kwargs):
        raise RuntimeError("db log failure")

    monkeypatch.setattr(project_service, "log_transformation", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"

    restored_df = read_table_safe(file_path)
    assert restored_df.equals(original_df)


def test_transform_preview_returns_first_page(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 1,
            "page_size": 50,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == 101
    assert data["total_pages"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 50

    assert data["row_count"] == 50
    assert len(data["rows"]) == 50

    assert data["rows"][0] == ["User 0", 0]
    assert data["rows"][-1] == ["User 49", 49]


def test_transform_preview_returns_second_page(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 2,
            "page_size": 50,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == 101
    assert data["total_pages"] == 3
    assert data["page"] == 2
    assert data["page_size"] == 50

    assert data["row_count"] == 50
    assert len(data["rows"]) == 50

    assert data["rows"][0] == ["User 50", 50]
    assert data["rows"][-1] == ["User 99", 99]


def test_transform_preview_returns_partial_last_page(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 3,
            "page_size": 50,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == 101
    assert data["total_pages"] == 3
    assert data["page"] == 3
    assert data["page_size"] == 50

    assert data["row_count"] == 1
    assert len(data["rows"]) == 1

    assert data["rows"][0] == ["User 100", 100]


def test_transform_preview_clamps_out_of_range_page(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 999,
            "page_size": 50,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == 101
    assert data["total_pages"] == 3

    # Page 999 is clamped to the last valid page.
    assert data["page"] == 3
    assert data["page_size"] == 50

    assert data["row_count"] == 1
    assert data["rows"] == [["User 100", 100]]


def test_transform_preview_exactly_divisible_by_page_size(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 2,
            "page_size": 50,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": "<",
                "value": "100",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    # The filter produces exactly 100 rows.
    assert data["total_rows"] == 100
    assert data["total_pages"] == 2
    assert data["page"] == 2
    assert data["page_size"] == 50

    assert data["row_count"] == 50
    assert len(data["rows"]) == 50

    assert data["rows"][0] == ["User 50", 50]
    assert data["rows"][-1] == ["User 99", 99]


def test_transform_preview_page_size_100_boundary(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={
            "preview": "true",
            "page": 1,
            "page_size": 100,
        },
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == 101
    assert data["total_pages"] == 2
    assert data["page"] == 1
    assert data["page_size"] == 100

    assert data["row_count"] == 100
    assert len(data["rows"]) == 100

    assert data["rows"][0] == ["User 0", 0]
    assert data["rows"][-1] == ["User 99", 99]


def test_transform_preview_defaults_to_first_page(client, pagination_project):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={"preview": "true"},
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    # Default page=1 and page_size=50.
    assert data["total_rows"] == 101
    assert data["total_pages"] == 3
    assert data["page"] == 1
    assert data["page_size"] == 50

    assert data["row_count"] == 50
    assert len(data["rows"]) == 50

    assert data["rows"][0] == ["User 0", 0]
    assert data["rows"][-1] == ["User 49", 49]
