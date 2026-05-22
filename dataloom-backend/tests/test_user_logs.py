import uuid

from app.services.project_service import create_project


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

    def test_get_logs_existing_project_returns_200(self, client, db, test_user):
        # Projects are created by CSV upload in production; inserting the row
        # directly is enough to exercise the /logs endpoint.
        project = create_project(
            db, name="logs-test-project", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        response = client.get(f"/logs/{project.project_id}")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_logs_existing_project_no_logs_returns_empty_list(self, client, db, test_user):
        project = create_project(
            db, name="logs-empty-project", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        response = client.get(f"/logs/{project.project_id}")
        assert response.status_code == 200
        assert response.json() == []
