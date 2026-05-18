"""Tests for multi-format export."""

import json

import pytest


class TestMultiFormatExport:
    @pytest.fixture
    def uploaded_project(self, client, sample_csv, db):
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Export Test", "projectDescription": "Test export"},
            )
        assert response.status_code == 200
        return response.json()["project_id"]

    def test_export_csv_default(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    def test_export_csv_explicit(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]

    def test_export_json(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=json")
        assert response.status_code == 200
        assert "application/json" in response.headers["content-type"]
        data = json.loads(response.content)
        assert isinstance(data, list)
        assert len(data) > 0

    def test_export_tsv(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=tsv")
        assert response.status_code == 200
        assert "tab-separated" in response.headers["content-type"]
        lines = response.text.strip().split("\n")
        assert len(lines) > 1
        assert "\t" in lines[0]

    def test_export_xlsx(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=xlsx")
        assert response.status_code == 200
        assert "spreadsheetml" in response.headers["content-type"]
        assert len(response.content) > 0

    def test_export_parquet(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=parquet")
        assert response.status_code == 200
        assert len(response.content) > 0

    def test_export_invalid_format(self, client, uploaded_project):
        response = client.get(f"/projects/{uploaded_project}/export?format=pdf")
        assert response.status_code == 400
        assert "Unsupported" in response.json()["detail"]

    def test_export_nonexistent_project(self, client, db):
        import uuid

        response = client.get(f"/projects/{uuid.uuid4()}/export?format=csv")
        assert response.status_code == 404
