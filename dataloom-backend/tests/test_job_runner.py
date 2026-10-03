"""Unit tests for the job machinery: JobContext, error redaction, the service hooks, shutdown."""

import threading
import uuid
from pathlib import Path

import pandas as pd
import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import HTTPException
from sqlalchemy import func, select

from app import models
from app.jobs import context as job_context
from app.jobs.context import JobCancelled, JobContext, JobFailed
from app.jobs.runner import redact_job_error
from app.services import job_service, pipeline_service, project_service
from app.services.transformation_service import TransformationError
from app.utils.pandas_helpers import save_table_safe
from tests.test_jobs import FILTER, SORT, _create_pipeline, _submit, _upload, _wait_for_terminal

BACKEND_ROOT = Path(__file__).resolve().parents[1]


class _Clock:
    def __init__(self):
        self.now = 100.0

    def __call__(self):
        return self.now


@pytest.fixture
def writes(monkeypatch):
    recorded = []
    monkeypatch.setattr(
        job_service,
        "write_progress",
        lambda _factory, _job_id, current, total, message: recorded.append((current, total, message)),
    )
    return recorded


def _ctx(clock=None):
    event = threading.Event()
    ctx = JobContext(uuid.uuid4(), lambda: None, event, clock=clock or _Clock())
    return ctx, event


class TestJobContext:
    def test_step_writes_are_throttled_but_stages_are_not(self, writes):
        clock = _Clock()
        ctx, _ = _ctx(clock)
        ctx.set_total(4)

        ctx.stage("Reading project data")
        ctx.step("Step 1 of 4 · Sort")  # 0 s after the stage: skipped
        clock.now += 0.2
        ctx.step("Step 2 of 4 · Sort")  # 0.2 s: skipped
        clock.now += 0.4
        ctx.step("Step 3 of 4 · Sort")  # 0.6 s: written
        ctx.stage("Something else")  # always written
        ctx.enter_commit_phase()  # always written

        assert writes == [
            (0, 4, "Reading project data"),
            (3, 4, "Step 3 of 4 · Sort"),
            (3, 4, "Something else"),
            (4, 4, "Saving"),
        ]

    def test_replay_hook_formats_the_step(self, writes):
        ctx, _ = _ctx()

        ctx.replay_hook(11, 45, "Sort")

        assert (ctx.current, ctx.total, ctx.message) == (1, 45, "Step 12 of 45 · Sort")

    def test_step_stops_on_a_pending_cancel(self, writes):
        ctx, event = _ctx()
        event.set()

        with pytest.raises(JobCancelled):
            ctx.step("Step 1 of 1 · Sort")
        assert ctx.current == 0

    def test_enter_commit_phase_stops_on_a_pending_cancel(self, writes):
        ctx, event = _ctx()
        event.set()

        with pytest.raises(JobCancelled):
            ctx.enter_commit_phase()
        assert not ctx.committing
        assert writes == []

    def test_cancel_is_ignored_once_committing(self, writes):
        ctx, event = _ctx()
        ctx.enter_commit_phase()
        event.set()

        ctx.check_cancelled()  # does not raise
        assert ctx.committing


class TestRedactJobError:
    @pytest.mark.parametrize(
        "error, expected",
        [
            (JobFailed("The project was deleted while this job was running."), None),
            (TransformationError("Column 'f0' already exists"), "Column 'f0' already exists"),
            (TransformationError("cannot read /Users/me/uploads/x.csv"), "Invalid transformation request"),
            (HTTPException(404, "File not found: /Users/me/uploads/x.csv"), "File not found"),
            (HTTPException(500, "Error reading file: boom"), "Internal server error"),
            (HTTPException(400, {"nested": "detail"}), "Internal server error"),
            (HTTPException(400, "line one\nline two"), "Invalid transformation request"),
            (KeyError("/secret/path"), "Internal server error"),
        ],
    )
    def test_redaction(self, error, expected):
        assert redact_job_error(error) == (expected if expected is not None else str(error))


class _Stop(Exception):
    pass


def _raise_stop(*_args):
    raise _Stop()


class TestServiceHooks:
    def test_on_step_exception_escapes_the_replay_unchanged(self):
        df = pd.DataFrame({"name": ["b", "a"]})
        steps = [("sort", SORT)]

        with pytest.raises(_Stop):
            pipeline_service.apply_pipeline(df, steps, on_step=_raise_stop)

    def test_on_step_sees_every_step_with_its_label(self):
        df = pd.DataFrame({"name": ["b", "a"], "age": [30, 20]})
        seen = []

        pipeline_service.apply_pipeline(
            df, [("filter", FILTER), ("sort", SORT)], on_step=lambda *args: seen.append(args)
        )

        assert seen == [(0, 2, "Filter"), (1, 2, "Sort")]

    def test_compatibility_check_is_unchanged(self):
        df = pd.DataFrame({"name": ["b", "a"]})

        result = pipeline_service.check_steps_compatibility(df, [("sort", SORT)])

        assert result.compatible is True

    def test_before_commit_failure_leaves_the_pipeline_target_untouched(self, db, test_user, tmp_path):
        path = tmp_path / "data_copy.csv"
        save_table_safe(pd.DataFrame({"name": ["b", "a"], "age": [30, 20]}), path)
        before = path.read_bytes()
        project = project_service.create_project(db, "p", str(path), "d", test_user.id)
        pipeline = pipeline_service.create_pipeline_from_steps(db, test_user.id, "sort", None, [])
        db.add(models.PipelineStep(pipeline_id=pipeline.id, step_order=0, action_type="sort", action_details=SORT))
        db.commit()
        db.refresh(pipeline)

        with pytest.raises(_Stop):
            pipeline_service.apply_pipeline_to_project(
                db, project, pipeline, pd.read_csv(path), before_commit=_raise_stop
            )

        assert path.read_bytes() == before
        assert db.scalar(select(func.count()).select_from(models.ProjectChangeLog)) == 0

    def test_revert_hooks_and_before_commit_failure(self, client, db, sample_csv):
        project_id = _upload(client, sample_csv, "Revert hooks")
        client.post(f"/projects/{project_id}/transform", json=FILTER)
        client.post(f"/projects/{project_id}/save", params={"commit_message": "one"})
        client.post(f"/projects/{project_id}/transform", json=SORT)  # unapplied
        project = db.get(models.Project, uuid.UUID(project_id))
        checkpoint_id = db.scalars(
            select(models.Checkpoint.id).where(models.Checkpoint.project_id == project.project_id)
        ).one()
        before = Path(project.file_path).read_bytes()
        seen = []

        with pytest.raises(_Stop):
            project_service.revert_project(
                db,
                project,
                checkpoint_id,
                on_step=lambda *args: seen.append(args),
                before_commit=_raise_stop,
            )

        assert seen == [(0, 1, "Filter")]
        assert Path(project.file_path).read_bytes() == before
        unapplied = db.scalar(
            select(func.count())
            .select_from(models.ProjectChangeLog)
            .where(models.ProjectChangeLog.project_id == project.project_id, models.ProjectChangeLog.applied.is_(False))
        )
        assert unapplied == 1


class TestShutdown:
    def test_running_job_is_interrupted_and_reported(self, client, db, sample_csv, threaded_job_runner, monkeypatch):
        monkeypatch.setattr(job_context, "PROGRESS_INTERVAL_SECONDS", 0.0)
        reached, release = threading.Event(), threading.Event()
        original = job_service.write_progress

        def _hold(session_factory, job_id, current, total, message):
            original(session_factory, job_id, current, total, message)
            if message.startswith("Step 1 of"):
                reached.set()
                assert release.wait(10)

        monkeypatch.setattr(job_service, "write_progress", _hold)
        project_id = _upload(client, sample_csv, "Shutdown")
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])
        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)

        cancel_event = threaded_job_runner._cancel_events[uuid.UUID(job["id"])]
        stopper = threading.Thread(target=threaded_job_runner.shutdown)
        stopper.start()
        assert cancel_event.wait(10), "shutdown should flag the running job"
        release.set()
        stopper.join(10)

        assert not stopper.is_alive()
        final = _wait_for_terminal(client, job["id"])
        assert final["status"] == "failed"
        assert final["error"] == job_service.INTERRUPTED_BY_SHUTDOWN
        assert _submit(client, project_id, {"kind": "revert"}).status_code == 503


def test_single_alembic_head():
    """Startup runs `alembic upgrade head`, which refuses to pick between two heads.

    CI runs the suite on SQLite and never runs Alembic, so without this check a
    second head (two migrations revising the same parent) would only surface as
    a Postgres backend that fails to start.
    """
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
    heads = ScriptDirectory.from_config(config).get_heads()
    assert len(heads) == 1, f"expected one Alembic head, found {heads}"
