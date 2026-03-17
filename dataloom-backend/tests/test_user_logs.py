import uuid


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

    def test_get_logs_existing_project_returns_200(self, client):
        # Create a project first
        create_response = client.post(
            "/projects/",
            json={"name": "logs-test-project"},
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["id"]

        response = client.get(f"/logs/{project_id}")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_get_logs_existing_project_no_logs_returns_empty_list(self, client):
        create_response = client.post(
            "/projects/",
            json={"name": "logs-empty-project"},
        )
        assert create_response.status_code == 200
        project_id = create_response.json()["id"]

        response = client.get(f"/logs/{project_id}")
        assert response.status_code == 200
        assert response.json() == []
