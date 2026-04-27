import uuid

from app import models


class TestLogsEndpoint:
    def test_get_logs_nonexistent_project_returns_404(self, client):
        nonexistent_id = uuid.uuid4()
        response = client.get(f"/logs/{nonexistent_id}")
        assert response.status_code == 404
        detail = response.json()["detail"]
        assert isinstance(detail, str)
        assert "not found" in detail.lower()

    def test_get_checkpoints_nonexistent_project_returns_404(self, client):
        nonexistent_id = uuid.uuid4()
        response = client.get(f"/logs/checkpoints/{nonexistent_id}")
        assert response.status_code == 404
        detail = response.json()["detail"]
        assert isinstance(detail, str)
        assert "not found" in detail.lower()

    def test_get_logs_existing_project_returns_200(self, client, db):
        # Projects are created by CSV upload in production; inserting the row
        # directly is enough to exercise the /logs endpoint.
        project = models.Project(name="logs-test-project", file_path="/tmp/test.csv", description="")
        db.add(project)
        db.commit()
        db.refresh(project)

        response = client.get(f"/logs/{project.project_id}")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_logs_existing_project_no_logs_returns_empty_list(self, client, db):
        project = models.Project(name="logs-empty-project", file_path="/tmp/test.csv", description="")
        db.add(project)
        db.commit()
        db.refresh(project)

        response = client.get(f"/logs/{project.project_id}")
        assert response.status_code == 200
        assert response.json() == []
