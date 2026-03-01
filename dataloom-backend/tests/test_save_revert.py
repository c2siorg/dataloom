"""Tests for save and revert logic in the project service."""

import time
from datetime import datetime, timedelta, timezone

from app import models
from app.services.project_service import (
    create_checkpoint,
    log_transformation,
    get_recent_projects,
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
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        original_ts = project.last_modified

        time.sleep(0.01)  # ensure measurable time difference
        log_transformation(db, project.project_id, "addRow", {"row_params": {"index": 0}})

        db.refresh(project)
        assert project.last_modified is not None
        assert project.last_modified > original_ts

    def test_create_checkpoint_updates_last_modified(self, db):
        """Saving a checkpoint should update last_modified (issue #66)."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        original_ts = project.last_modified

        time.sleep(0.01)
        create_checkpoint(db, project.project_id, "save point")

        db.refresh(project)
        assert project.last_modified is not None
        assert project.last_modified > original_ts

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
        now = datetime.now(timezone.utc)

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
