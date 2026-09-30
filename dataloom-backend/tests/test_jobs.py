"""Tests for background jobs: pipeline Runs and reverts executed off the request path.

Most tests use the conftest's inline runner, where a job runs to completion
inside the submitting request. Tests that need a job to be mid-flight use
``threaded_job_runner`` and hold the job at a progress write with an Event, so
the interleaving is deterministic rather than timed.
"""

import threading
import time
import uuid
from pathlib import Path

import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app import models
from app.jobs import context as job_context
from app.jobs import runner as runner_module
from app.jobs.registry import PROJECT_GONE
from app.main import app
from app.services import job_service, project_service
from app.services.auth_service import create_access_token
from app.utils.security import SAFE_TRANSFORMATION_ERROR_DETAIL

TERMINAL = {"succeeded", "failed", "cancelled"}

FILTER = {"operation_type": "filter", "parameters": {"column": "age", "condition": ">", "value": "26"}}
SORT = {"operation_type": "sort", "sort_params": {"column": "name", "ascending": True}}
ADD_COLUMN = {"operation_type": "addCol", "add_col_params": {"index": 0, "name": "extra"}}


def _upload(client, sample_csv, name="Jobs"):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": name, "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def _transform(client, project_id, payload):
    response = client.post(f"/projects/{project_id}/transform", json=payload)
    assert response.status_code == 200, response.text


def _create_pipeline(client, project_id, steps):
    response = client.post(
        "/pipelines",
        json={
            "name": "Clean up",
            "project_id": project_id,
            "steps": [{"action_type": s["operation_type"], "action_details": s} for s in steps],
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


def _save(client, project_id, message):
    response = client.post(f"/projects/{project_id}/save", params={"commit_message": message})
    assert response.status_code == 200, response.text


def _checkpoint_id(client, project_id, message):
    checkpoints = client.get(f"/logs/checkpoints/{project_id}").json()
    return next(c["id"] for c in checkpoints if c["message"] == message)


def _working_copy(db, project_id) -> Path:
    project = db.get(models.Project, uuid.UUID(project_id), populate_existing=True)
    return Path(project.file_path)


def _log_state(client, project_id):
    """The change log as replay sees it: order, operation, details, applied."""
    logs = sorted(client.get(f"/logs/{project_id}").json(), key=lambda log: log["id"])
    return [(log["action_type"], log["action_details"], log["applied"]) for log in logs]


def _count(db, model, *where) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*where))


def _submit(client, project_id, body):
    return client.post(f"/projects/{project_id}/jobs", json=body)


def _wait_for_terminal(client, job_id, timeout=10.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        body = client.get(f"/jobs/{job_id}").json()
        if body["status"] in TERMINAL:
            return body
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} did not finish within {timeout}s")


def _active_job(db, user, project_id, *, kind="revert", is_exclusive=True, status="running"):
    job = models.Job(
        owner_id=user.id,
        project_id=uuid.UUID(project_id),
        kind=kind,
        is_exclusive=is_exclusive,
        status=status,
        params={},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


@pytest.fixture
def project_id(client, sample_csv):
    return _upload(client, sample_csv, "Source")


@pytest.fixture
def twin_project_id(client, sample_csv):
    return _upload(client, sample_csv, "Twin")


@pytest.fixture
def record_progress(monkeypatch):
    """Record every progress write, with throttling off so none is skipped."""
    monkeypatch.setattr(job_context, "PROGRESS_INTERVAL_SECONDS", 0.0)
    writes = []
    original = job_service.write_progress

    def _record(session_factory, job_id, current, total, message):
        writes.append((current, total, message))
        original(session_factory, job_id, current, total, message)

    monkeypatch.setattr(job_service, "write_progress", _record)
    return writes


@pytest.fixture
def hold_at(monkeypatch):
    """Hold a threaded job at the first progress write whose message starts with a prefix.

    Returns ``(reached, release)``: ``reached`` is set once the job is parked,
    and the job resumes when the test sets ``release``.
    """
    monkeypatch.setattr(job_context, "PROGRESS_INTERVAL_SECONDS", 0.0)
    reached, release = threading.Event(), threading.Event()
    state = {"prefix": None}
    original = job_service.write_progress

    def _write(session_factory, job_id, current, total, message):
        original(session_factory, job_id, current, total, message)
        if state["prefix"] and message.startswith(state["prefix"]) and not reached.is_set():
            reached.set()
            assert release.wait(10), "test never released the job"

    monkeypatch.setattr(job_service, "write_progress", _write)

    def _arm(prefix):
        state["prefix"] = prefix
        return reached, release

    return _arm


class TestPipelineRunJob:
    def test_matches_the_sync_apply(self, client, db, project_id, twin_project_id):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT, ADD_COLUMN])

        sync = client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": project_id})
        assert sync.status_code == 200, sync.text

        response = _submit(client, twin_project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id})
        assert response.status_code == 202, response.text
        job = response.json()
        assert response.headers["Location"] == f"/jobs/{job['id']}"
        assert job["kind"] == "pipelineRun"
        assert job["is_exclusive"] is True
        assert job["params"] == {"pipeline_id": pipeline_id}

        polled = client.get(f"/jobs/{job['id']}").json()
        assert polled["status"] == "succeeded", polled
        assert polled["error"] is None
        assert polled["result"] == {"steps": 3, "rows": 3, "columns": 4}
        assert polled["started_at"] is not None and polled["finished_at"] is not None

        assert _working_copy(db, twin_project_id).read_bytes() == _working_copy(db, project_id).read_bytes()
        assert _log_state(client, twin_project_id) == _log_state(client, project_id)
        assert len(_log_state(client, twin_project_id)) == 3

    def test_progress_reaches_total_with_stage_and_step_messages(self, client, project_id, record_progress):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()

        assert [message for _, _, message in record_progress] == [
            "Reading project data",
            "Step 1 of 2 · Filter",
            "Step 2 of 2 · Sort",
            "Saving",
        ]
        assert record_progress[-1][:2] == (2, 2)
        polled = client.get(f"/jobs/{job['id']}").json()
        assert polled["progress"] == {"current": 2, "total": 2, "message": "Done"}

    def test_step_failure_is_reported_like_the_sync_apply(self, client, project_id):
        steps = [{"operation_type": "filter", "parameters": {"column": "nope", "condition": ">", "value": "1"}}]
        pipeline_id = _create_pipeline(client, project_id, steps)
        before = _log_state(client, project_id)

        sync = client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": project_id})
        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()

        polled = client.get(f"/jobs/{job['id']}").json()
        assert polled["status"] == "failed"
        assert polled["error"] == sync.json()["detail"]
        assert polled["error"].startswith("Pipeline step 0 (filter) failed")
        assert _log_state(client, project_id) == before

    def test_unknown_pipeline_is_a_404_at_submit(self, client, db, project_id):
        response = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": str(uuid.uuid4())})

        assert response.status_code == 404
        assert _count(db, models.Job) == 0


class TestRevertJob:
    def _history(self, client, project_id):
        _transform(client, project_id, FILTER)
        _save(client, project_id, "filtered")
        _transform(client, project_id, SORT)
        _save(client, project_id, "sorted")
        _transform(client, project_id, ADD_COLUMN)

    def test_matches_the_sync_revert(self, client, db, project_id, twin_project_id):
        self._history(client, project_id)
        self._history(client, twin_project_id)

        sync = client.post(
            f"/projects/{project_id}/revert",
            params={"checkpoint_id": _checkpoint_id(client, project_id, "filtered")},
        )
        assert sync.status_code == 200, sync.text

        checkpoint_id = _checkpoint_id(client, twin_project_id, "filtered")
        response = _submit(client, twin_project_id, {"kind": "revert", "checkpoint_id": checkpoint_id})
        assert response.status_code == 202, response.text

        polled = client.get(f"/jobs/{response.json()['id']}").json()
        assert polled["status"] == "succeeded", polled
        assert polled["result"]["rows"] == 3
        assert _working_copy(db, twin_project_id).read_bytes() == _working_copy(db, project_id).read_bytes()
        assert _log_state(client, twin_project_id) == _log_state(client, project_id)

    def test_revert_to_original(self, client, db, project_id, sample_csv):
        self._history(client, project_id)

        job = _submit(client, project_id, {"kind": "revert", "checkpoint_id": None}).json()

        assert client.get(f"/jobs/{job['id']}").json()["status"] == "succeeded"
        pd.testing.assert_frame_equal(pd.read_csv(_working_copy(db, project_id)), pd.read_csv(sample_csv))
        assert all(applied for _, _, applied in _log_state(client, project_id))

    def test_progress_messages(self, client, project_id, record_progress):
        self._history(client, project_id)
        checkpoint_id = _checkpoint_id(client, project_id, "sorted")

        _submit(client, project_id, {"kind": "revert", "checkpoint_id": checkpoint_id})

        assert [message for _, _, message in record_progress] == [
            "Reading project data",
            "Step 1 of 2 · Filter",
            "Step 2 of 2 · Sort",
            "Saving",
        ]

    def test_checkpoint_of_another_project_is_a_404_at_submit(self, client, project_id, twin_project_id):
        _save(client, twin_project_id, "elsewhere")
        foreign = _checkpoint_id(client, twin_project_id, "elsewhere")

        response = _submit(client, project_id, {"kind": "revert", "checkpoint_id": foreign})

        assert response.status_code == 404
        assert response.json()["detail"] == "Checkpoint not found"


class TestSubmitValidation:
    def test_unknown_kind_is_a_422(self, client, project_id):
        assert _submit(client, project_id, {"kind": "deleteEverything"}).status_code == 422

    def test_missing_pipeline_id_is_a_422(self, client, project_id):
        assert _submit(client, project_id, {"kind": "pipelineRun"}).status_code == 422

    def test_unknown_project_is_a_404(self, client):
        assert _submit(client, str(uuid.uuid4()), {"kind": "revert"}).status_code == 404

    def test_requires_auth(self, anon_client):
        assert _submit(anon_client, str(uuid.uuid4()), {"kind": "revert"}).status_code == 401


class TestLimits:
    def test_second_exclusive_job_is_a_409_with_the_active_id(self, client, db, test_user, project_id):
        active = _active_job(db, test_user, project_id)

        response = _submit(client, project_id, {"kind": "revert"})

        assert response.status_code == 409
        assert response.json() == {
            "detail": "Another job is already running on this project.",
            "active_job_id": str(active.id),
        }

    def test_index_rejects_a_raced_insert(self, db, test_user, project_id):
        _active_job(db, test_user, project_id, status="queued")
        db.add(
            models.Job(
                owner_id=test_user.id,
                project_id=uuid.UUID(project_id),
                kind="revert",
                is_exclusive=True,
                status="running",
                params={},
            )
        )
        with pytest.raises(Exception, match="UNIQUE constraint failed"):
            db.commit()
        db.rollback()

    def test_index_ignores_finished_and_non_exclusive_jobs(self, db, test_user, project_id):
        for status in ("succeeded", "failed", "cancelled"):
            _active_job(db, test_user, project_id, status=status)
        _active_job(db, test_user, project_id, is_exclusive=False)
        _active_job(db, test_user, project_id, is_exclusive=False)
        _active_job(db, test_user, project_id)  # the one active exclusive job

        assert _count(db, models.Job) == 6

    def test_raced_submit_is_a_409_with_the_winner(self, client, db, test_user, project_id, monkeypatch):
        # Skip the pre-check so the insert itself hits the partial unique index,
        # as a submit racing another past the check would.
        winner = _active_job(db, test_user, project_id)
        monkeypatch.setattr(job_service, "ensure_no_active_exclusive_job", lambda *args: None)

        response = _submit(client, project_id, {"kind": "revert"})

        assert response.status_code == 409
        assert response.json()["active_job_id"] == str(winner.id)

    def test_per_user_cap_is_a_429(self, client, db, test_user, project_id, twin_project_id):
        for _ in range(4):
            _active_job(db, test_user, project_id, is_exclusive=False)

        response = _submit(client, twin_project_id, {"kind": "revert"})

        assert response.status_code == 429
        assert _count(db, models.Job, models.Job.project_id == uuid.UUID(twin_project_id)) == 0


class TestOwnership:
    @pytest.fixture
    def other_job(self, db, sample_csv, client):
        other = models.User(email="other@test.com", password_hash="x")
        db.add(other)
        db.commit()
        db.refresh(other)
        # Upload as the other user, then switch back.
        own_cookie = client.headers["Cookie"]
        client.headers["Cookie"] = f"access_token={create_access_token(other.id)}"
        other_project = _upload(client, sample_csv, "Theirs")
        client.headers["Cookie"] = own_cookie
        return _active_job(db, other, other_project), other_project

    def test_another_users_job_is_hidden(self, client, other_job):
        job, other_project = other_job

        assert client.get(f"/jobs/{job.id}").status_code == 404
        assert client.post(f"/jobs/{job.id}/cancel").status_code == 404
        assert client.get(f"/projects/{other_project}/jobs").status_code == 404
        assert _submit(client, other_project, {"kind": "revert"}).status_code == 404

    def test_unknown_job_is_a_404(self, client):
        assert client.get(f"/jobs/{uuid.uuid4()}").status_code == 404


class TestListAndCancel:
    def test_active_filter(self, client, db, test_user, project_id):
        done = _active_job(db, test_user, project_id, status="succeeded")
        running = _active_job(db, test_user, project_id)

        active = client.get(f"/projects/{project_id}/jobs", params={"active": "true"}).json()
        everything = client.get(f"/projects/{project_id}/jobs").json()

        assert [job["id"] for job in active] == [str(running.id)]
        assert {job["id"] for job in everything} == {str(done.id), str(running.id)}

    def test_cancel_queued_job_is_immediate_and_it_never_runs(self, client, db, test_user, project_id):
        queued = _active_job(db, test_user, project_id, status="queued")

        response = client.post(f"/jobs/{queued.id}/cancel")

        assert response.status_code == 202
        assert response.json()["status"] == "cancelled"
        assert response.json()["cancel_requested"] is True
        runner_module.runner.submit(queued.id)  # a worker picking it up later skips it
        assert client.get(f"/jobs/{queued.id}").json()["status"] == "cancelled"

    def test_cancel_finished_job_is_a_409(self, client, db, test_user, project_id):
        done = _active_job(db, test_user, project_id, status="succeeded")

        response = client.post(f"/jobs/{done.id}/cancel")

        assert response.status_code == 409


class TestCancelThreaded:
    def test_cancel_mid_run_changes_nothing(self, client, db, project_id, threaded_job_runner, hold_at):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT, ADD_COLUMN])
        working_copy = _working_copy(db, project_id)
        before_bytes, before_logs = working_copy.read_bytes(), _log_state(client, project_id)
        reached, release = hold_at("Step 1 of")

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)
        cancel = client.post(f"/jobs/{job['id']}/cancel")
        release.set()

        assert cancel.status_code == 202
        assert cancel.json()["status"] == "running"
        assert cancel.json()["cancel_requested"] is True
        final = _wait_for_terminal(client, job["id"])
        assert final["status"] == "cancelled"
        assert final["error"] is None
        assert working_copy.read_bytes() == before_bytes
        assert _log_state(client, project_id) == before_logs

    def test_cancel_during_revert_changes_nothing(self, client, db, project_id, threaded_job_runner, hold_at):
        _transform(client, project_id, FILTER)
        _save(client, project_id, "filtered")
        _transform(client, project_id, SORT)
        _save(client, project_id, "sorted")
        checkpoint_id = _checkpoint_id(client, project_id, "filtered")
        working_copy = _working_copy(db, project_id)
        before_bytes, before_logs = working_copy.read_bytes(), _log_state(client, project_id)
        reached, release = hold_at("Reading project data")

        job = _submit(client, project_id, {"kind": "revert", "checkpoint_id": checkpoint_id}).json()
        assert reached.wait(10)
        client.post(f"/jobs/{job['id']}/cancel")
        release.set()

        assert _wait_for_terminal(client, job["id"])["status"] == "cancelled"
        assert working_copy.read_bytes() == before_bytes
        assert _log_state(client, project_id) == before_logs

    def test_cancel_after_the_write_starts_finishes_the_job(self, client, db, project_id, threaded_job_runner, hold_at):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])
        reached, release = hold_at("Saving")

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)
        client.post(f"/jobs/{job['id']}/cancel")
        release.set()

        final = _wait_for_terminal(client, job["id"])
        assert final["status"] == "succeeded"
        assert final["cancel_requested"] is True
        assert len(_log_state(client, project_id)) == 2

    def test_threaded_run_succeeds(self, client, project_id, threaded_job_runner):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])

        response = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id})

        assert response.status_code == 202
        assert response.json()["status"] in {"queued", "running", "succeeded"}
        assert _wait_for_terminal(client, response.json()["id"])["status"] == "succeeded"
        assert len(_log_state(client, project_id)) == 2

    def test_active_job_blocks_a_second_submit_and_sync_writes(
        self, client, db, project_id, threaded_job_runner, hold_at
    ):
        pipeline_id = _create_pipeline(client, project_id, [FILTER])
        reached, release = hold_at("Step 1 of")

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)
        try:
            second = _submit(client, project_id, {"kind": "revert"})
            apply = client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": project_id})
            listed = client.get(f"/projects/{project_id}/jobs", params={"active": "true"}).json()
        finally:
            release.set()

        assert second.status_code == 409
        assert second.json()["active_job_id"] == job["id"]
        assert apply.status_code == 409
        assert [j["id"] for j in listed] == [job["id"]]
        assert listed[0]["progress"]["message"] == "Step 1 of 1 · Filter"
        assert _wait_for_terminal(client, job["id"])["status"] == "succeeded"


class TestProjectDeletedMidJob:
    def _delete_project_row(self, db, project_id, *, with_jobs=False):
        pid = uuid.UUID(project_id)
        if with_jobs:
            db.execute(delete(models.Job).where(models.Job.project_id == pid))
        db.execute(delete(models.ProjectChangeLog).where(models.ProjectChangeLog.project_id == pid))
        db.execute(delete(models.Project).where(models.Project.project_id == pid))
        db.commit()

    def test_job_fails_cleanly_and_writes_nothing(self, client, db, project_id, threaded_job_runner, hold_at):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])
        working_copy = _working_copy(db, project_id)
        before_bytes = working_copy.read_bytes()
        reached, release = hold_at("Step 1 of")

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)
        # Bypass the endpoint's 409, as a delete racing the submit would.
        self._delete_project_row(db, project_id)
        release.set()
        threaded_job_runner.drain()

        final = db.get(models.Job, uuid.UUID(job["id"]), populate_existing=True)
        assert final.status == "failed"
        assert final.error == PROJECT_GONE
        assert working_copy.read_bytes() == before_bytes
        assert _count(db, models.ProjectChangeLog) == 0

    def test_job_row_deleted_with_the_project_ends_quietly(self, client, db, project_id, threaded_job_runner, hold_at):
        pipeline_id = _create_pipeline(client, project_id, [FILTER, SORT])
        reached, release = hold_at("Step 1 of")

        job = _submit(client, project_id, {"kind": "pipelineRun", "pipeline_id": pipeline_id}).json()
        assert reached.wait(10)
        self._delete_project_row(db, project_id, with_jobs=True)  # what the Postgres cascade does
        release.set()
        threaded_job_runner.drain()

        assert db.get(models.Job, uuid.UUID(job["id"])) is None
        assert client.get(f"/jobs/{job['id']}").status_code == 404


class TestRedaction:
    def test_missing_original_file_path_never_reaches_the_client(self, client, db, project_id, monkeypatch):
        original = Path(str(_working_copy(db, project_id)).replace("_copy", ""))
        original.unlink()
        logged = []
        monkeypatch.setattr(runner_module.logger, "exception", lambda *args, **kwargs: logged.append(args))
        monkeypatch.setattr(runner_module.logger, "warning", lambda *args, **kwargs: logged.append(args))

        job = _submit(client, project_id, {"kind": "revert"}).json()

        polled = client.get(f"/jobs/{job['id']}").json()
        assert polled["status"] == "failed"
        assert polled["error"] == "File not found"
        assert "/" not in polled["error"]
        assert logged, "the full failure should still be logged server-side"

    @pytest.mark.parametrize(
        "error, expected",
        [
            (HTTPException(500, "Error reading file: /Users/someone/uploads/x.csv"), "Internal server error"),
            (HTTPException(400, "bad value in /srv/data/uploads/x_copy.csv"), "Internal server error"),
            (HTTPException(400, "psycopg2 said no"), SAFE_TRANSFORMATION_ERROR_DETAIL),
            (HTTPException(404, "Checkpoint not found"), "Checkpoint not found"),
            (RuntimeError("/var/lib/secret/path exploded"), "Internal server error"),
        ],
    )
    def test_errors_are_redacted_before_storage(self, client, project_id, monkeypatch, error, expected):
        def _boom(*args, **kwargs):
            raise error

        monkeypatch.setattr(project_service, "read_table_safe", _boom)
        monkeypatch.setattr(runner_module.logger, "exception", lambda *args, **kwargs: None)

        job = _submit(client, project_id, {"kind": "revert"}).json()

        polled = client.get(f"/jobs/{job['id']}").json()
        assert polled["status"] == "failed"
        assert polled["error"] == expected


class TestGuards:
    def test_delete_project_with_an_active_job_is_a_409(self, client, db, test_user, project_id):
        active = _active_job(db, test_user, project_id)

        blocked = client.delete(f"/projects/{project_id}")
        assert blocked.status_code == 409
        assert blocked.json()["active_job_id"] == str(active.id)

        active.status = "succeeded"
        db.commit()
        assert client.delete(f"/projects/{project_id}").status_code == 200
        assert _count(db, models.Job) == 0

    def test_sync_revert_and_apply_are_409_while_a_job_is_active(self, client, db, test_user, project_id):
        pipeline_id = _create_pipeline(client, project_id, [FILTER])
        _active_job(db, test_user, project_id)

        assert client.post(f"/projects/{project_id}/revert").status_code == 409
        assert client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": project_id}).status_code == 409

    def test_non_exclusive_job_does_not_block_sync_writes(self, client, db, test_user, project_id):
        _active_job(db, test_user, project_id, is_exclusive=False)

        assert client.post(f"/projects/{project_id}/revert").status_code == 200

    def test_account_deletion_with_an_active_job_is_a_409(self, client, db, test_user, project_id):
        active = _active_job(db, test_user, project_id)

        response = client.request("DELETE", "/auth/me", json={"password": "testpassword"})

        assert response.status_code == 409
        assert response.json()["active_job_id"] == str(active.id)
        assert db.get(models.User, test_user.id) is not None

    def test_account_deletion_removes_finished_jobs(self, client, db, test_user):
        # A dangling project id (SQLite does not enforce the FK): deleting an
        # account that owns a project currently fails on main for an unrelated
        # reason (StaleDataError on the loaded user.projects), so keep the
        # user project-free and test only the jobs clean-up.
        _active_job(db, test_user, str(uuid.uuid4()), status="succeeded")

        response = client.request("DELETE", "/auth/me", json={"password": "testpassword"})

        assert response.status_code == 200
        assert _count(db, models.Job) == 0


class TestStartupRecovery:
    def test_interrupted_jobs_are_failed_on_startup(self, db, test_user, client, project_id, twin_project_id):
        running = _active_job(db, test_user, project_id, status="running")
        queued = _active_job(db, test_user, twin_project_id, status="queued")
        done = _active_job(db, test_user, project_id, status="succeeded")

        with TestClient(app):  # a fresh lifespan, as after a restart
            pass

        for job in (running, queued):
            db.refresh(job)
            assert job.status == "failed"
            assert job.error == "Interrupted by a server restart"
            assert job.finished_at is not None
        db.refresh(done)
        assert done.status == "succeeded"
        assert done.error is None

    def test_expired_jobs_are_purged_on_startup(self, db, test_user, client, project_id):
        from datetime import UTC, datetime, timedelta

        old = _active_job(db, test_user, project_id, status="succeeded")
        old.finished_at = datetime.now(UTC) - timedelta(days=8)
        recent = _active_job(db, test_user, project_id, status="failed")
        recent.finished_at = datetime.now(UTC) - timedelta(days=1)
        db.commit()
        old_id, recent_id = old.id, recent.id

        with TestClient(app):
            pass

        db.expire_all()
        assert db.get(models.Job, old_id) is None
        assert db.get(models.Job, recent_id) is not None
