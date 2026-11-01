import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.services.project_service import create_project


@pytest.fixture
def pagination_project(db, test_user, tmp_path):
    """A real, owned dataset isolated from the application's upload directory."""
    path = tmp_path / "pagination_copy.csv"
    pd.DataFrame({"A": range(120)}).to_csv(path, index=False)
    return create_project(db, "Pagination Test", str(path), "Test", test_user.id)


@pytest.mark.parametrize(
    ("parameter", "value"),
    [
        ("pageSize", 0),
        ("pageSize", -1),
        ("pageSize", 101),
        ("pageSize", 100000),
        ("page", 0),
        ("page", -1),
        ("pageSize", "invalid"),
        ("page", "invalid"),
    ],
)
def test_get_project_rejects_invalid_pagination(client, pagination_project, parameter, value):
    response = client.get(f"/projects/get/{pagination_project.project_id}", params={parameter: value})

    assert response.status_code == 422, response.text
    assert any(error["loc"] == ["query", parameter] for error in response.json()["detail"])


@pytest.mark.parametrize(
    ("params", "page", "page_size", "total_pages", "start", "end"),
    [
        ({}, 1, 50, 3, 0, 50),
        ({"page": 2}, 2, 50, 3, 50, 100),
        ({"page": 3}, 3, 50, 3, 100, 120),
        ({"page": 2, "pageSize": 20}, 2, 20, 6, 20, 40),
        ({"page": 2, "pageSize": 100}, 2, 100, 2, 100, 120),
        ({"page": 120, "pageSize": 1}, 120, 1, 120, 119, 120),
        ({"page": 999, "pageSize": 50}, 3, 50, 3, 100, 120),
    ],
)
def test_get_project_pagination(client, pagination_project, params, page, page_size, total_pages, start, end):
    response = client.get(f"/projects/get/{pagination_project.project_id}", params=params)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "filename": pagination_project.name,
        "file_path": pagination_project.file_path,
        "project_id": str(pagination_project.project_id),
        "columns": ["A"],
        "rows": [[value] for value in range(start, end)],
        "dtypes": {"A": "int"},
        "row_count": end - start,
        "total_rows": 120,
        "total_pages": total_pages,
        "page": page,
        "page_size": page_size,
    }


@pytest.mark.parametrize("page", [1, 999])
def test_get_empty_project_has_one_empty_page(client, pagination_project, page):
    pd.DataFrame({"A": []}).to_csv(pagination_project.file_path, index=False)

    response = client.get(f"/projects/get/{pagination_project.project_id}", params={"page": page})

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["columns"] == ["A"]
    assert data["rows"] == []
    assert data["row_count"] == 0
    assert data["total_rows"] == 0
    assert data["total_pages"] == 1
    assert data["page"] == 1
    assert data["page_size"] == 50


def test_upload_pagination(client: TestClient):
    # Create 120 rows
    df = pd.DataFrame({"A": range(120)})
    csv_content = df.to_csv(index=False).encode("utf-8")

    files = {"file": ("data.csv", csv_content, "text/csv")}
    data = {"projectName": "Pagination Test", "projectDescription": "Test"}

    # Defaults (1, 50)
    response = client.post(
        "/projects/upload",
        files=files,
        data=data,
    )
    assert response.status_code == 200, response.text
    res_data = response.json()
    assert len(res_data["rows"]) == 50
    assert res_data["total_rows"] == 120
    assert res_data["total_pages"] == 3
    assert res_data["page"] == 1
    assert res_data["page_size"] == 50
    project_id = res_data["project_id"]

    # Revert with custom pagination
    response = client.post(
        f"/projects/{project_id}/revert",
        params={"page": 3, "page_size": 50},
    )
    assert response.status_code == 200, response.text
    res_data = response.json()
    assert len(res_data["rows"]) == 20
    assert res_data["page"] == 3

    # Save with custom pagination
    response = client.post(
        f"/projects/{project_id}/save",
        params={"commit_message": "test", "page": 2, "page_size": 20},
    )
    assert response.status_code == 200, response.text
    res_data = response.json()
    assert len(res_data["rows"]) == 20
    assert res_data["page"] == 2
    assert res_data["page_size"] == 20
