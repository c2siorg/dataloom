"""Tests for save and revert logic in the project service."""

from app import models
from app.services.project_service import (
    create_checkpoint,
    log_transformation,
)


class TestCheckpoint:
    def test_create_checkpoint_marks_logs(self, db):
        """Creating a checkpoint should mark unapplied logs as applied."""
        # Create a project record
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        # Log a transformation
        log_transformation(db, project.project_id, "addRow", {"row_params": {"index": 0}})

        # Verify log is unapplied
        logs = db.query(models.ProjectChangeLog).filter_by(project_id=project.project_id).all()
        assert len(logs) == 1
        assert not logs[0].applied

        # Create checkpoint
        checkpoint = create_checkpoint(db, project.project_id, "First save")

        # Verify log is now applied
        db.refresh(logs[0])
        assert logs[0].applied
        assert logs[0].checkpoint_id == checkpoint.id

    def test_checkpoint_message(self, db):
        """Checkpoint should store the commit message."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        checkpoint = create_checkpoint(db, project.project_id, "My save message")
        assert checkpoint.message == "My save message"
