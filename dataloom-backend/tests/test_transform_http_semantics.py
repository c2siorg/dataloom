"""HTTP semantics tests for the transform endpoint."""


def _upload_project(client, sample_csv):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "HTTP Semantics", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def test_transform_preserves_http_exception_status(client, sample_csv):
    project_id = _upload_project(client, sample_csv)

    # Missing filter params should return the explicit 400 from endpoint validation.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "filter"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Filter parameters required"


def test_transform_maps_transformation_error_to_400(client, sample_csv):
    project_id = _upload_project(client, sample_csv)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "missing_column", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_transform_returns_500_on_unexpected_exception(client, sample_csv, monkeypatch):
    project_id = _upload_project(client, sample_csv)

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


def test_transform_returns_500_on_unexpected_exception_during_persistence(client, sample_csv, monkeypatch):
    project_id = _upload_project(client, sample_csv)

    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
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
