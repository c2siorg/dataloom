"""Tests for logs and checkpoints endpoints."""

from datetime import datetime, timedelta

from app import models
from app.api.endpoints.user_logs import get_checkpoints


class TestCheckpointsEndpoint:
    def test_get_checkpoints_returns_empty_list(self, db):
        project = models.Project(name="project", file_path="/tmp/project.csv", description="desc")
        db.add(project)
        db.commit()
        db.refresh(project)

        response = get_checkpoints(project.project_id, db)

        assert response == []

    def test_get_checkpoints_returns_all_in_desc_order(self, db):
        project = models.Project(name="project", file_path="/tmp/project.csv", description="desc")
        db.add(project)
        db.commit()
        db.refresh(project)

        older = models.Checkpoint(
            project_id=project.project_id,
            message="older checkpoint",
            created_at=datetime.now() - timedelta(hours=2),
        )
        newer = models.Checkpoint(
            project_id=project.project_id,
            message="newer checkpoint",
            created_at=datetime.now() - timedelta(hours=1),
        )
        db.add(older)
        db.add(newer)
        db.commit()

        response = get_checkpoints(project.project_id, db)

        assert len(response) == 2
        assert response[0].message == "newer checkpoint"
        assert response[1].message == "older checkpoint"
