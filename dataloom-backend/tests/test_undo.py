"""Tests for undo transformation logic."""

from app import models
from app.services.project_service import (
    delete_change_log,
    get_last_change_log,
    log_transformation,
)


class TestUndo:
    def test_get_last_change_log_returns_most_recent(self, db):
        """get_last_change_log should return the most recently added log."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        log_transformation(db, project.project_id, "filter", {"column": "City"})
        log_transformation(db, project.project_id, "sort", {"column": "Age"})

        last_log = get_last_change_log(db, project.project_id)
        assert last_log is not None
        assert last_log.action_type == "sort"

    def test_get_last_change_log_returns_none_when_empty(self, db):
        """get_last_change_log should return None when no logs exist."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        last_log = get_last_change_log(db, project.project_id)
        assert last_log is None

    def test_delete_change_log_removes_entry(self, db):
        """delete_change_log should remove the log entry from the database."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        log_transformation(db, project.project_id, "filter", {"column": "City"})

        last_log = get_last_change_log(db, project.project_id)
        assert last_log is not None

        delete_change_log(db, last_log)
        db.commit()

        remaining = db.query(models.ProjectChangeLog).filter_by(project_id=project.project_id).all()
        assert len(remaining) == 0
