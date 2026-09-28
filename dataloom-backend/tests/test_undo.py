"""Tests for undo transformation logic."""

from app import models
from app.services.project_service import (
    create_checkpoint,
    delete_change_log,
    get_last_pending_change_log,
    log_transformation,
)


class TestUndo:
    def test_get_last_pending_change_log_returns_most_recent(self, db, test_user):
        """get_last_pending_change_log should return the most recently added log."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        log_transformation(db, project.project_id, "filter", {"column": "City"})
        log_transformation(db, project.project_id, "sort", {"column": "Age"})

        last_log = get_last_pending_change_log(db, project.project_id)
        assert last_log is not None
        assert last_log.action_type == "sort"

    def test_get_last_pending_change_log_returns_none_when_empty(self, db, test_user):
        """get_last_pending_change_log should return None when no logs exist."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        last_log = get_last_pending_change_log(db, project.project_id)
        assert last_log is None

    def test_delete_change_log_removes_entry(self, db, test_user):
        """delete_change_log should remove the log entry from the database."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        log_transformation(db, project.project_id, "filter", {"column": "City"})

        last_log = get_last_pending_change_log(db, project.project_id)
        assert last_log is not None

        delete_change_log(db, last_log)
        db.commit()

        remaining = db.query(models.ProjectChangeLog).filter_by(project_id=project.project_id).all()
        assert len(remaining) == 0

    def test_get_last_pending_change_log_skips_saved_rows(self, db, test_user):
        """Saved rows belong to a checkpoint, so undo must never pick one."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)

        log_transformation(db, project.project_id, "filter", {"column": "City"})
        create_checkpoint(db, project.project_id, "saved")
        assert get_last_pending_change_log(db, project.project_id) is None

        log_transformation(db, project.project_id, "sort", {"column": "Age"})
        last_log = get_last_pending_change_log(db, project.project_id)
        assert last_log is not None
        assert last_log.action_type == "sort"
