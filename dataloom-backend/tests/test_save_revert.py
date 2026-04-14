"""Tests for save and revert logic in the project service."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app import models
from app.services.project_service import (
    create_checkpoint,
    get_recent_projects,
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
        assert logs[0].applied is False

        # Create checkpoint
        checkpoint = create_checkpoint(db, project.project_id, "First save")

        # Verify log is now applied
        db.refresh(logs[0])
        assert logs[0].applied is True
        assert logs[0].checkpoint_id == checkpoint.id

    def test_checkpoint_message(self, db):
        """Checkpoint should store the commit message."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        checkpoint = create_checkpoint(db, project.project_id, "My save message")
        assert checkpoint.message == "My save message"


class TestLastModified:
    """Regression tests for issue #66 - last_modified never updating."""

    def test_log_transformation_updates_last_modified(self, db):
        """Applying a transformation should update last_modified (issue #66)."""
        before = datetime.now(UTC) - timedelta(seconds=5)
        project = models.Project(
            name="test",
            file_path="/tmp/test.csv",
            description="test",
            last_modified=before,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        original_ts = project.last_modified
        assert original_ts is not None, "last_modified was unexpectedly None after explicit assignment"

        log_transformation(db, project.project_id, "addRow", {"row_params": {"index": 0}})

        db.refresh(project)
        assert project.last_modified is not None
        assert project.last_modified > original_ts

    def test_create_checkpoint_updates_last_modified(self, db):
        """Saving a checkpoint should update last_modified (issue #66)."""
        before = datetime.now(UTC) - timedelta(seconds=5)
        project = models.Project(
            name="test",
            file_path="/tmp/test.csv",
            description="test",
            last_modified=before,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        original_ts = project.last_modified
        assert original_ts is not None, "last_modified was unexpectedly None after explicit assignment"

        create_checkpoint(db, project.project_id, "save point")

        db.refresh(project)
        assert project.last_modified is not None
        assert project.last_modified > original_ts

    def test_project_field_update_does_not_auto_update_last_modified(self, db):
        """Updating project metadata alone should not change last_modified."""
        before = datetime.now(UTC) - timedelta(seconds=5)
        project = models.Project(
            name="Old Name",
            file_path="/tmp/test.csv",
            description="test",
            last_modified=before,
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        original_ts = project.last_modified
        assert original_ts is not None

        project.name = "New Name"
        db.commit()
        db.refresh(project)

        assert project.last_modified == original_ts

    def test_upload_date_remains_timezone_naive(self, db):
        """upload_date should remain timezone-naive (no +offset side effect)."""
        project = models.Project(
            name="Upload Date Project",
            file_path="/tmp/test.csv",
            description="test",
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        assert project.upload_date is not None
        assert project.upload_date.tzinfo is None

    def test_server_default_populates_last_modified_when_not_explicitly_set(self, db):
        """Project creation without explicit last_modified should still populate it."""
        project = models.Project(
            name="Server Default Project",
            file_path="/tmp/test.csv",
            description="test",
        )
        db.add(project)
        db.commit()
        db.refresh(project)

        assert project.last_modified is not None, "server_default did not populate last_modified"

    def test_log_transformation_missing_project_raises(self, db):
        """Calling log_transformation with a non-existent project_id should raise ValueError."""
        missing_id = uuid.uuid4()
        with pytest.raises(ValueError, match=str(missing_id)):
            log_transformation(db, missing_id, "addRow", {})
        assert not db.new
        assert not db.dirty
        assert not db.deleted

    def test_create_checkpoint_missing_project_raises(self, db):
        """Calling create_checkpoint with a non-existent project_id should raise ValueError."""
        missing_id = uuid.uuid4()
        with pytest.raises(ValueError, match=str(missing_id)):
            create_checkpoint(db, missing_id, "save point")
        assert not db.new
        assert not db.dirty
        assert not db.deleted

    def test_log_transformation_missing_project_does_not_persist_orphan_log(self, db):
        """Missing project error should not leak a pending log into later commits."""
        missing_id = uuid.uuid4()

        with pytest.raises(ValueError, match=str(missing_id)):
            log_transformation(db, missing_id, "addRow", {})

        # Commit unrelated work using the same session.
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()

        leaked_logs = db.query(models.ProjectChangeLog).filter_by(project_id=missing_id).all()
        assert leaked_logs == []

    def test_create_checkpoint_missing_project_does_not_persist_orphan_checkpoint(self, db):
        """Missing project error should not leak a pending checkpoint into later commits."""
        missing_id = uuid.uuid4()

        with pytest.raises(ValueError, match=str(missing_id)):
            create_checkpoint(db, missing_id, "save point")

        # Commit unrelated work using the same session.
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()

        leaked_checkpoints = db.query(models.Checkpoint).filter_by(project_id=missing_id).all()
        assert leaked_checkpoints == []

    def test_recent_projects_ordering_after_transformation(self, db):
        """Recent projects should reorder after modifying an older project (issue #66).

        Reproduces the exact scenario from the bug report:
        - Upload Project A, then Project B (B is newer)
        - Project B appears first (most recently uploaded)
        - Apply a transformation to Project A
        - Project A should now appear first

        Uses explicit timestamps to avoid SQLite's second-level precision
        causing both projects to share the same last_modified value.
        """
        now = datetime.now(UTC)

        # Project A was uploaded 10 seconds ago
        project_a = models.Project(
            name="Project A",
            file_path="/tmp/a.csv",
            description="a",
            last_modified=now - timedelta(seconds=10),
        )
        db.add(project_a)

        # Project B was uploaded 5 seconds ago (more recent)
        project_b = models.Project(
            name="Project B",
            file_path="/tmp/b.csv",
            description="b",
            last_modified=now - timedelta(seconds=5),
        )
        db.add(project_b)
        db.commit()
        db.refresh(project_a)
        db.refresh(project_b)

        # B should be first before any modifications
        recent = get_recent_projects(db, limit=2)
        assert recent[0].name == "Project B"
        assert recent[1].name == "Project A"

        # Modify Project A via a transformation — last_modified should jump to now
        log_transformation(db, project_a.project_id, "addRow", {"row_params": {"index": 0}})

        # Now Project A should be first because its last_modified was just updated
        recent = get_recent_projects(db, limit=2)
        assert recent[0].name == "Project A"
        assert recent[1].name == "Project B"
