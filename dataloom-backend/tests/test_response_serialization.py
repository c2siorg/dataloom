"""Regression tests for API response serialization semantics."""

import csv


def test_upload_response_preserves_missing_values_as_null(client, tmp_path, db):
    csv_path = tmp_path / "missing_values.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age", "city"])
        writer.writerow(["Alice", "", "New York"])
        writer.writerow(["Bob", "25", "Los Angeles"])

    with open(csv_path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("missing_values.csv", f, "text/csv")},
            data={
                "projectName": "Missing Values Project",
                "projectDescription": "Regression fixture for response null semantics",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rows"][0][1] is None
    assert payload["rows"][1][1] == 25.0
