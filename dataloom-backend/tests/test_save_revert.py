"""Tests for save and revert logic in the project service."""

from app import models
from app.services.project_service import (
    create_checkpoint,
    create_project,
    log_transformation,
)


class TestCheckpoint:
    def test_create_checkpoint_marks_logs(self, db, test_user):
        """Creating a checkpoint should mark unapplied logs as applied."""
        project = create_project(db, name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)

        # Log a transformation
        log_transformation(db, project.project_id, "addRow", {"row_params": {"index": 0}})

        # Verify log is unapplied
        logs = db.query(models.ProjectChangeLog).filter_by(project_id=project.project_id).all()
        assert len(logs) == 1
        assert logs[0].applied is False

        # Create checkpoint
        checkpoint = create_checkpoint(db, project.project_id, "First save")

        # Verify log is now applied
        db.refresh(logs[0])
        assert logs[0].applied is True
        assert logs[0].checkpoint_id == checkpoint.id

    def test_checkpoint_message(self, db, test_user):
        """Checkpoint should store the commit message."""
        project = create_project(db, name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)

        checkpoint = create_checkpoint(db, project.project_id, "My save message")
        assert checkpoint.message == "My save message"
