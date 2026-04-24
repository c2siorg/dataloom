"""Tests for the last_modified timestamp fix in project_service.log_transformation().

Tests are written at the service layer to avoid the Alembic/SQLite FK-constraint
incompatibility in the SQLite CI environment. They use the in-memory SQLite engine
from conftest.py (via the `db` fixture) and call project_service functions directly.
"""

import time
from datetime import datetime

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app import models
from app.services.project_service import (
    create_checkpoint,
    create_project,
    get_recent_projects,
    log_transformation,
)

# ── Lightweight in-memory engine (no Alembic) ────────────────────────────────

TEST_DB_URL = "sqlite://"  # pure in-memory, no file


@pytest.fixture
def mem_engine():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture
def mem_db(mem_engine):
    with Session(mem_engine) as session:
        yield session


def _make_project(db, name="Test"):
    """Create a minimal Project row with a fake file_path."""
    return create_project(db, name=name, file_path=f"/tmp/{name}.csv", description="test")


# ── Tests ─────────────────────────────────────────────────────────────────────


class TestLastModifiedUpdatesOnTransform:
    """last_modified must advance each time log_transformation() is called."""

    def test_last_modified_advances_after_one_transform(self, mem_db):
        project = _make_project(mem_db, "LM Basic")
        ts_before = project.last_modified

        time.sleep(0.05)

        log_transformation(
            mem_db,
            project.project_id,
            "addRow",
            {"operation_type": "addRow", "row_params": {"index": 0}},
        )

        mem_db.refresh(project)
        ts_after = project.last_modified

        assert ts_after > ts_before, f"last_modified was not updated: before={ts_before}, after={ts_after}"

    def test_last_modified_advances_after_multiple_transforms(self, mem_db):
        project = _make_project(mem_db, "LM Multi")
        timestamps = []

        for i in range(3):
            time.sleep(0.05)
            log_transformation(
                mem_db,
                project.project_id,
                "addRow",
                {"operation_type": "addRow", "row_params": {"index": i}},
            )
            mem_db.refresh(project)
            timestamps.append(project.last_modified)

        assert timestamps[0] < timestamps[1] < timestamps[2], f"Timestamps did not strictly increase: {timestamps}"

    def test_last_modified_is_set_to_utc_datetime(self, mem_db):
        project = _make_project(mem_db, "LM UTC")
        time.sleep(0.02)
        log_transformation(
            mem_db,
            project.project_id,
            "addRow",
            {"operation_type": "addRow", "row_params": {"index": 0}},
        )
        mem_db.refresh(project)
        # Should be a datetime, not None
        assert isinstance(project.last_modified, datetime)

    def test_most_recently_transformed_project_appears_first_in_recent(self, mem_db):
        """Project A, created first but transformed last, should lead /recent."""
        project_a = _make_project(mem_db, "LM Order A")
        time.sleep(0.05)
        project_b = _make_project(mem_db, "LM Order B")

        # Transform A after B was created — A should bubble to top
        time.sleep(0.05)
        log_transformation(
            mem_db,
            project_a.project_id,
            "addRow",
            {"operation_type": "addRow", "row_params": {"index": 0}},
        )

        recent = get_recent_projects(mem_db, limit=10)
        ids = [str(p.project_id) for p in recent]

        idx_a = ids.index(str(project_a.project_id))
        idx_b = ids.index(str(project_b.project_id))

        assert idx_a < idx_b, f"Project A (last transformed) should appear before B. Order: {ids}"

    def test_log_transformation_creates_change_log_entry(self, mem_db):
        """log_transformation must still write the ProjectChangeLog row."""
        project = _make_project(mem_db, "LM Log")
        details = {"operation_type": "addRow", "row_params": {"index": 0}}

        log_transformation(mem_db, project.project_id, "addRow", details)

        logs = (
            mem_db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.project_id == project.project_id).all()
        )
        assert len(logs) == 1
        assert logs[0].action_type == "addRow"

    def test_log_transformation_with_unknown_project_id_does_not_raise(self, mem_db):
        """If the project_id is not in the DB, the timestamp update is skipped gracefully."""
        import uuid

        fake_id = uuid.uuid4()
        # Should not raise — the `if project:` guard handles the None case
        log_transformation(mem_db, fake_id, "addRow", {"row_params": {"index": 0}})


class TestLastModifiedUpdatesOnCheckpoint:
    """last_modified must advance each time create_checkpoint() is called."""

    def test_last_modified_advances_after_checkpoint(self, mem_db):
        project = _make_project(mem_db, "CP Basic")
        ts_before = project.last_modified

        time.sleep(0.05)
        create_checkpoint(mem_db, project.project_id, "first save")

        mem_db.refresh(project)
        ts_after = project.last_modified

        assert ts_after > ts_before, f"last_modified was not updated: before={ts_before}, after={ts_after}"

    def test_checkpoint_after_transform_advances_timestamp(self, mem_db):
        """A checkpoint following a transform should push last_modified forward again."""
        project = _make_project(mem_db, "CP After Transform")

        time.sleep(0.05)
        log_transformation(
            mem_db,
            project.project_id,
            "addRow",
            {"operation_type": "addRow", "row_params": {"index": 0}},
        )
        mem_db.refresh(project)
        ts_after_transform = project.last_modified

        time.sleep(0.05)
        create_checkpoint(mem_db, project.project_id, "save after transform")
        mem_db.refresh(project)
        ts_after_checkpoint = project.last_modified

        assert ts_after_checkpoint > ts_after_transform, (
            f"checkpoint did not advance last_modified: "
            f"transform={ts_after_transform}, checkpoint={ts_after_checkpoint}"
        )

    def test_most_recently_checkpointed_project_appears_first_in_recent(self, mem_db):
        """Project A, created first but checkpointed last, should lead /recent."""
        project_a = _make_project(mem_db, "CP Order A")
        time.sleep(0.05)
        project_b = _make_project(mem_db, "CP Order B")

        time.sleep(0.05)
        create_checkpoint(mem_db, project_a.project_id, "save A")

        recent = get_recent_projects(mem_db, limit=10)
        ids = [str(p.project_id) for p in recent]

        idx_a = ids.index(str(project_a.project_id))
        idx_b = ids.index(str(project_b.project_id))

        assert idx_a < idx_b, f"Project A (last checkpointed) should appear before B. Order: {ids}"

    def test_checkpoint_still_marks_pending_logs_applied(self, mem_db):
        """Adding last_modified update must not break the existing applied-logs behavior."""
        project = _make_project(mem_db, "CP Logs")
        log_transformation(
            mem_db,
            project.project_id,
            "addRow",
            {"operation_type": "addRow", "row_params": {"index": 0}},
        )

        checkpoint = create_checkpoint(mem_db, project.project_id, "save logs")

        logs = (
            mem_db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.project_id == project.project_id).all()
        )
        assert len(logs) == 1
        assert logs[0].applied is True
        assert logs[0].checkpoint_id == checkpoint.id
