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

    def test_delete_checkpoint_nonexistent_returns_404(self, client, db, test_user):
        project = create_project(
            db, name="delete-checkpoint-404-project", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )
        nonexistent_checkpoint_id = uuid.uuid4()

        response = client.delete(f"/logs/checkpoints/{project.project_id}/{nonexistent_checkpoint_id}")
        assert response.status_code == 404
        detail = response.json()["detail"]
        assert isinstance(detail, str)
        assert "not found" in detail.lower()

    def test_delete_checkpoint_removes_checkpoint(self, client, db, test_user):
        from app.models import Checkpoint
        from app.services.project_service import create_checkpoint

        project = create_project(
            db,
            name="delete-checkpoint-removed-project",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )
        checkpoint = create_checkpoint(db, project.project_id, "to be deleted")

        response = client.delete(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        deleted = db.query(Checkpoint).filter(Checkpoint.id == checkpoint.id).first()
        assert deleted is None

    def test_delete_checkpoint_unlinks_logs(self, client, db, test_user):
        from app.models import ProjectChangeLog
        from app.services.project_service import create_checkpoint, log_transformation

        project = create_project(
            db,
            name="delete-checkpoint-unlink-project",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )
        log_transformation(db, project.project_id, "filter", {"column": "a"})
        checkpoint = create_checkpoint(db, project.project_id, "checkpoint to delete")

        log = db.query(ProjectChangeLog).filter(ProjectChangeLog.project_id == project.project_id).first()
        assert log.checkpoint_id == checkpoint.id

        response = client.delete(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        db.refresh(log)
        assert log.checkpoint_id is None

    def test_checkpoint_boundary_limits_replayed_logs(self, db, test_user):
        from app.models import ProjectChangeLog
        from app.services.project_service import _logs_to_replay, create_checkpoint, log_transformation

        project = create_project(
            db,
            name="checkpoint-boundaries",
            file_path="/tmp/checkpoint-boundaries.csv",
            description="",
            owner_id=test_user.id,
        )
        log_transformation(db, project.project_id, "first", {})
        first_log = db.query(ProjectChangeLog).filter_by(project_id=project.project_id).one()
        first_checkpoint = create_checkpoint(db, project.project_id, "first")

        log_transformation(db, project.project_id, "second", {})
        second_log = (
            db.query(ProjectChangeLog)
            .filter_by(project_id=project.project_id)
            .order_by(ProjectChangeLog.change_log_id.desc())
            .first()
        )
        second_checkpoint = create_checkpoint(db, project.project_id, "second")

        assert first_checkpoint.last_change_log_id == first_log.change_log_id
        assert second_checkpoint.last_change_log_id == second_log.change_log_id
        assert [log.change_log_id for log in _logs_to_replay(db, project.project_id, first_checkpoint.id)] == [
            first_log.change_log_id
        ]
        assert [log.change_log_id for log in _logs_to_replay(db, project.project_id, second_checkpoint.id)] == [
            first_log.change_log_id,
            second_log.change_log_id,
        ]
