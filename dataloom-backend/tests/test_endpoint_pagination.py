import pandas as pd
from fastapi.testclient import TestClient


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
