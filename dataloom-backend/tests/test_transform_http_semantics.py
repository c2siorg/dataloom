"""HTTP semantics tests for the transform endpoint."""

import pytest
from fastapi import HTTPException

from app.utils.pandas_helpers import read_csv_safe


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


def test_transform_redacts_csv_not_found_path_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(status_code=404, detail="CSV file not found: /tmp/private/uploads/project.csv")

    monkeypatch.setattr(transformations_endpoint, "read_csv_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "CSV file not found"


def test_transform_redacts_internal_http_exception_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(
            status_code=500,
            detail="Error reading CSV: [Errno 13] Permission denied: /tmp/private/uploads/project.csv",
        )

    monkeypatch.setattr(transformations_endpoint, "read_csv_safe", boom)

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
    monkeypatch.setattr(transformations_endpoint, "save_csv_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"
    assert calls, "save_csv_safe was never called; persistence path may not have been exercised"


def test_transform_reverts_file_if_log_transformation_fails(client, project, monkeypatch):
    project_id = project["project_id"]
    file_path = project["file_path"]
    original_df = read_csv_safe(file_path)

    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise RuntimeError("db log failure")

    monkeypatch.setattr(transformations_endpoint, "log_transformation", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"

    restored_df = read_csv_safe(file_path)
    assert restored_df.equals(original_df)
