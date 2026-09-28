"""End-to-end tests for snapshot-based undo and redo.

Everything goes through the real HTTP endpoints (upload, transform, pipeline
apply, add file, save, revert, undo, redo), so the tests pin what a user sees:
the working copy's exact bytes, the change log, and the undo/redo state.
"""

import os
import stat
import uuid
from pathlib import Path

import pytest
from fastapi import HTTPException

from app import models
from app.api.endpoints import projects as projects_endpoint
from app.config import get_settings
from app.services import project_service
from app.utils import pandas_helpers
from tests.conftest import TEST_USER_PASSWORD

PEOPLE_CSV = b"name,age,city\nAlice,30,NY\nBob,25,LA\nCharlie,35,SF\n"

FILTER_AGE_OVER_26 = {
    "operation_type": "filter",
    "parameters": {"column": "age", "condition": ">", "value": "26"},
}
DELETE_FIRST_ROW = {"operation_type": "delRow", "row_params": {"index": 0}}


def _sort(column: str, ascending: bool = True) -> dict:
    return {"operation_type": "sort", "sort_params": {"column": column, "ascending": ascending}}


def _edit_cell(row_index: int, col_index: int, value) -> dict:
    """A cell edit; ``col_index`` is 1-based, counting the S.No. display column."""
    return {
        "operation_type": "changeCellValue",
        "change_cell_value": {"row_index": row_index, "col_index": col_index, "fill_value": value},
    }


SORT_BY_NAME_DESC = _sort("name", ascending=False)
SORT_BY_AGE = _sort("age")


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    """Keep uploads and snapshots in a per-test directory, so file counts are exact."""
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "uploads"))


@pytest.fixture
def snapshot_limit(monkeypatch):
    def _set(limit: int) -> None:
        monkeypatch.setattr(get_settings(), "undo_snapshot_limit", limit)

    return _set


@pytest.fixture
def replay_calls(monkeypatch):
    """Count undos that fell back to replaying the change log."""
    calls = []
    original = projects_endpoint._replay_change_log

    def counting(*args, **kwargs):
        calls.append(args)
        return original(*args, **kwargs)

    monkeypatch.setattr(projects_endpoint, "_replay_change_log", counting)
    return calls


def _upload(client, content: bytes = PEOPLE_CSV, name: str = "people.csv") -> str:
    response = client.post(
        "/projects/upload",
        files={"file": (name, content, "text/csv")},
        data={"projectName": "Undo Redo", "projectDescription": "undo/redo tests"},
    )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def _transform(client, project_id: str, payload: dict, **params) -> dict:
    response = client.post(f"/projects/{project_id}/transform", json=payload, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _undo(client, project_id: str):
    return client.post(f"/projects/{project_id}/undo")


def _redo(client, project_id: str):
    return client.post(f"/projects/{project_id}/redo")


def _state(client, project_id: str) -> dict:
    response = client.get(f"/projects/{project_id}/undo-state")
    assert response.status_code == 200, response.text
    return response.json()


def _rows(client, project_id: str) -> list:
    return client.get(f"/projects/get/{project_id}").json()["rows"]


def _log_types(client, project_id: str) -> list[str]:
    logs = sorted(client.get(f"/logs/{project_id}").json(), key=lambda log: log["id"])
    return [log["action_type"] for log in logs]


def _working_copy(db, project_id: str) -> Path:
    project = db.query(models.Project).filter(models.Project.project_id == uuid.UUID(project_id)).one()
    return Path(project.file_path)


def _snapshot_dir(project_id: str) -> Path:
    return Path(get_settings().upload_dir).resolve() / "snapshots" / project_id


def _snapshot_files(project_id: str) -> list[Path]:
    snapshot_dir = _snapshot_dir(project_id)
    return sorted(snapshot_dir.iterdir()) if snapshot_dir.is_dir() else []


def _steps(db, project_id: str) -> list[models.UndoStep]:
    db.expire_all()
    return (
        db.query(models.UndoStep)
        .filter(models.UndoStep.project_id == uuid.UUID(project_id))
        .order_by(models.UndoStep.id)
        .all()
    )


def _fail_next_commit(monkeypatch, db, error: Exception) -> None:
    """Make the shared session's next commit raise, then behave normally again."""
    real_commit = db.commit

    def failing_commit():
        monkeypatch.setattr(db, "commit", real_commit)
        raise error

    monkeypatch.setattr(db, "commit", failing_commit)


class TestUndo:
    def test_undo_restores_the_exact_pre_step_bytes(self, client, db):
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        _transform(client, project_id, SORT_BY_AGE)
        before = working_copy.read_bytes()

        _transform(client, project_id, FILTER_AGE_OVER_26)
        response = _undo(client, project_id)

        assert response.status_code == 200, response.text
        assert working_copy.read_bytes() == before
        assert response.json()["rows"] == _rows(client, project_id)
        assert _log_types(client, project_id) == ["sort"]

    @pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits")
    def test_undo_and_redo_keep_the_working_copy_mode(self, client, db):
        """Restoring swaps a temp file in, and temp files are created 0600."""
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        mode = stat.S_IMODE(working_copy.stat().st_mode)
        _transform(client, project_id, SORT_BY_AGE)

        assert _undo(client, project_id).status_code == 200
        assert stat.S_IMODE(working_copy.stat().st_mode) == mode
        assert _redo(client, project_id).status_code == 200
        assert stat.S_IMODE(working_copy.stat().st_mode) == mode

    def test_undo_returns_the_data_the_user_had(self, client):
        """Regression: replay re-ran the sort on the pre-edit text column, so
        undo returned ``10, 100, 9`` as strings — data the user never had."""
        project_id = _upload(client, b"code,label\nx,first\ny,second\nz,third\n", "codes.csv")
        for row_index, value in enumerate(["10", "9", "100"]):
            _transform(client, project_id, _edit_cell(row_index, 1, value))
        sorted_by_code = _transform(client, project_id, _sort("code"))
        _transform(client, project_id, _sort("label"))

        response = _undo(client, project_id)

        assert response.status_code == 200, response.text
        assert response.json()["rows"] == sorted_by_code["rows"]
        assert [row[0] for row in response.json()["rows"]] == [9, 10, 100]

    def test_undo_never_crosses_a_save(self, client, db):
        """Regression: undo deleted a saved row, changing what its checkpoint restores."""
        project_id = _upload(client, b"name,age\nAlice,30\nBob,25\nCharlie,35\n")
        working_copy = _working_copy(db, project_id)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        assert client.post(f"/projects/{project_id}/save", params={"commit_message": "only >26"}).status_code == 200
        saved = working_copy.read_bytes()

        response = _undo(client, project_id)

        assert response.status_code == 404
        assert response.json()["detail"] == "No transformations to undo"
        assert working_copy.read_bytes() == saved
        checkpoint_id = client.get(f"/logs/checkpoints/{project_id}").json()[0]["id"]
        reverted = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": checkpoint_id})
        assert reverted.json()["total_rows"] == 2

    def test_pipeline_run_is_undone_and_redone_as_one_step(self, client, db):
        """Regression: one undo left the Run's first step applied."""
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        pipeline = client.post(
            "/pipelines",
            json={
                "name": "Older, by name",
                "project_id": project_id,
                "steps": [
                    {"action_type": "filter", "action_details": FILTER_AGE_OVER_26},
                    {"action_type": "sort", "action_details": SORT_BY_NAME_DESC},
                ],
            },
        )
        assert pipeline.status_code == 200, pipeline.text
        before_run = working_copy.read_bytes()
        applied = client.post(f"/pipelines/{pipeline.json()['id']}/apply", json={"project_id": project_id})
        assert applied.status_code == 200, applied.text
        after_run = working_copy.read_bytes()
        assert _log_types(client, project_id) == ["filter", "sort"]

        assert _undo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == before_run
        assert _log_types(client, project_id) == []

        assert _redo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == after_run
        assert _log_types(client, project_id) == ["filter", "sort"]

    def test_nothing_to_undo_is_404(self, client):
        project_id = _upload(client)

        response = _undo(client, project_id)

        assert response.status_code == 404
        assert response.json()["detail"] == "No transformations to undo"


class TestRedo:
    def test_redo_restores_the_exact_post_step_bytes(self, client, db):
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        after = working_copy.read_bytes()
        _undo(client, project_id)

        response = _redo(client, project_id)

        assert response.status_code == 200, response.text
        assert working_copy.read_bytes() == after
        assert response.json()["rows"] == _rows(client, project_id)
        assert _log_types(client, project_id) == ["filter"]

    def test_undo_redo_undo_round_trips(self, client, db):
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        before = working_copy.read_bytes()
        _transform(client, project_id, SORT_BY_AGE)
        after = working_copy.read_bytes()

        for expected in (before, after, before, after, before):
            response = _undo(client, project_id) if expected == before else _redo(client, project_id)
            assert response.status_code == 200, response.text
            assert working_copy.read_bytes() == expected

    def test_redo_is_last_undone_first(self, client, db):
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        states = [working_copy.read_bytes()]
        for payload in (SORT_BY_AGE, FILTER_AGE_OVER_26, SORT_BY_NAME_DESC):
            _transform(client, project_id, payload)
            states.append(working_copy.read_bytes())

        for _ in range(3):
            assert _undo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == states[0]

        for expected, log_types in zip(
            states[1:], (["sort"], ["sort", "filter"], ["sort", "filter", "sort"]), strict=True
        ):
            assert _redo(client, project_id).status_code == 200
            assert working_copy.read_bytes() == expected
            assert _log_types(client, project_id) == log_types
        assert _redo(client, project_id).status_code == 404

    def test_new_change_discards_the_redo_stack(self, client):
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _undo(client, project_id)
        undone_files = set(_snapshot_files(project_id))

        _transform(client, project_id, FILTER_AGE_OVER_26)

        response = _redo(client, project_id)
        assert response.status_code == 404
        assert response.json()["detail"] == "Nothing to redo"
        assert not undone_files & set(_snapshot_files(project_id))

    def test_missing_redo_snapshot_discards_the_stack(self, client, db):
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _undo(client, project_id)
        Path(_steps(db, project_id)[0].after_path).unlink()

        assert _redo(client, project_id).status_code == 404
        assert _steps(db, project_id) == []
        assert _state(client, project_id) == {"can_undo": False, "can_redo": False}


class TestAddFile:
    def test_undo_and_redo_an_append(self, client):
        project_id = _upload(client)
        added = client.post(
            f"/projects/{project_id}/files",
            files={"file": ("more.csv", b"name,age,city\nDana,40,Paris\nEve,45,Oslo\n", "text/csv")},
        )
        assert added.status_code == 200, added.text
        assert added.json()["total_rows"] == 5

        undone = _undo(client, project_id)
        assert undone.json()["total_rows"] == 3
        assert len(client.get(f"/projects/{project_id}/files").json()) == 1

        redone = _redo(client, project_id)
        assert redone.json()["total_rows"] == 5
        assert _log_types(client, project_id) == ["addFile"]


class TestSaveRevertDeleteClearHistory:
    def _with_undo_and_redo(self, client) -> str:
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        _undo(client, project_id)
        assert _state(client, project_id) == {"can_undo": True, "can_redo": True}
        assert _snapshot_files(project_id)
        return project_id

    def test_save_clears_undo_and_redo(self, client, db):
        project_id = self._with_undo_and_redo(client)

        assert client.post(f"/projects/{project_id}/save", params={"commit_message": "x"}).status_code == 200

        assert _state(client, project_id) == {"can_undo": False, "can_redo": False}
        assert _steps(db, project_id) == []
        assert _snapshot_files(project_id) == []
        logs = db.query(models.ProjectChangeLog).filter_by(project_id=uuid.UUID(project_id)).all()
        assert [log.undo_step_id for log in logs] == [None]

    def test_revert_clears_undo_and_redo(self, client, db):
        project_id = self._with_undo_and_redo(client)

        assert client.post(f"/projects/{project_id}/revert").status_code == 200

        assert _state(client, project_id) == {"can_undo": False, "can_redo": False}
        assert _steps(db, project_id) == []
        assert _snapshot_files(project_id) == []

    def test_delete_project_removes_its_snapshots(self, client, db):
        project_id = self._with_undo_and_redo(client)

        assert client.delete(f"/projects/{project_id}").status_code == 200

        assert not _snapshot_dir(project_id).exists()
        assert _steps(db, project_id) == []

    def test_delete_account_removes_its_snapshots(self, client, db):
        project_id = self._with_undo_and_redo(client)

        response = client.request("DELETE", "/auth/me", json={"password": TEST_USER_PASSWORD})

        assert response.status_code == 200, response.text
        assert not _snapshot_dir(project_id).exists()
        assert db.query(models.UndoStep).count() == 0


class TestRetention:
    def test_snapshots_past_the_limit_are_evicted_and_undo_replays(self, client, db, snapshot_limit, replay_calls):
        snapshot_limit(2)
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        rows = [_rows(client, project_id)]
        states = [working_copy.read_bytes()]
        for payload in (SORT_BY_AGE, FILTER_AGE_OVER_26, SORT_BY_NAME_DESC):
            _transform(client, project_id, payload)
            rows.append(_rows(client, project_id))
            states.append(working_copy.read_bytes())
            assert len(_snapshot_files(project_id)) <= 2

        assert [step.before_path is not None for step in _steps(db, project_id)] == [False, True, True]

        assert _undo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == states[2]
        assert _undo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == states[1]
        assert replay_calls == []

        third = _undo(client, project_id)
        assert third.status_code == 200
        assert len(replay_calls) == 1
        assert third.json()["rows"] == rows[0]
        assert _rows(client, project_id) == rows[0]
        assert _log_types(client, project_id) == []

    def test_zero_limit_replays_every_undo_and_still_redoes(self, client, db, snapshot_limit, replay_calls):
        snapshot_limit(0)
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        original_rows = _rows(client, project_id)
        _transform(client, project_id, SORT_BY_AGE)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        filtered = working_copy.read_bytes()
        filtered_rows = _rows(client, project_id)
        assert _snapshot_files(project_id) == []

        assert _undo(client, project_id).status_code == 200
        assert _undo(client, project_id).status_code == 200
        assert len(replay_calls) == 2
        assert _rows(client, project_id) == original_rows

        assert _redo(client, project_id).status_code == 200
        assert _redo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == filtered
        assert _rows(client, project_id) == filtered_rows
        assert _log_types(client, project_id) == ["sort", "filter"]
        # Redone steps are done again, and a zero limit keeps no pre-change snapshot for them.
        assert _snapshot_files(project_id) == []


class TestLegacyRows:
    def test_row_logged_before_undo_steps_is_undone_by_replay_and_redoable(self, client, db, replay_calls):
        project_id = _upload(client)
        working_copy = _working_copy(db, project_id)
        original_rows = _rows(client, project_id)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        filtered = working_copy.read_bytes()
        # Strip the step so the row looks like one logged before this feature shipped.
        db.query(models.ProjectChangeLog).update({"undo_step_id": None})
        db.query(models.UndoStep).delete()
        db.commit()
        for snapshot in _snapshot_files(project_id):
            snapshot.unlink()

        undone = _undo(client, project_id)

        assert undone.status_code == 200, undone.text
        assert len(replay_calls) == 1
        assert undone.json()["rows"] == original_rows
        assert _log_types(client, project_id) == []
        assert _state(client, project_id) == {"can_undo": False, "can_redo": True}

        assert _redo(client, project_id).status_code == 200
        assert working_copy.read_bytes() == filtered
        assert _log_types(client, project_id) == ["filter"]
        assert _undo(client, project_id).status_code == 200
        assert len(replay_calls) == 1


class TestFailures:
    """A failure at any point leaves the file, the change log and the stacks as they were."""

    def _snapshot_state(self, client, db, project_id: str) -> tuple:
        return (
            _working_copy(db, project_id).read_bytes(),
            _log_types(client, project_id),
            _state(client, project_id),
            _snapshot_files(project_id),
        )

    def _with_redo_stack(self, client) -> str:
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _transform(client, project_id, FILTER_AGE_OVER_26)
        _undo(client, project_id)
        return project_id

    def test_failed_commit_during_transform(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)

        _fail_next_commit(monkeypatch, db, RuntimeError("commit failed"))
        response = client.post(f"/projects/{project_id}/transform", json=DELETE_FIRST_ROW)

        assert response.status_code == 500
        assert self._snapshot_state(client, db, project_id) == before
        assert _redo(client, project_id).status_code == 200

    def test_failed_write_during_transform(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)
        working_copy = _working_copy(db, project_id)

        def torn_write(*args, **kwargs):
            working_copy.write_text("")
            raise HTTPException(status_code=500, detail=f"Error saving file: {working_copy}")

        monkeypatch.setattr(project_service, "save_table_safe", torn_write)
        response = client.post(f"/projects/{project_id}/transform", json=DELETE_FIRST_ROW)

        assert response.status_code == 500
        assert str(working_copy) not in response.text
        assert self._snapshot_state(client, db, project_id) == before

    def test_failed_commit_during_snapshot_undo(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)

        _fail_next_commit(monkeypatch, db, RuntimeError("commit failed"))
        with pytest.raises(RuntimeError, match="commit failed"):
            _undo(client, project_id)

        assert self._snapshot_state(client, db, project_id) == before

    def test_failed_restore_during_undo(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)

        def locked(*args, **kwargs):
            raise PermissionError("file is open in another process")

        monkeypatch.setattr(projects_endpoint, "restore_snapshot", locked)
        response = _undo(client, project_id)

        assert response.status_code == 500
        assert response.json()["detail"] == "Could not undo; please retry."
        assert self._snapshot_state(client, db, project_id) == before

    def test_failed_write_during_replay_undo(self, client, db, monkeypatch, snapshot_limit):
        snapshot_limit(0)
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)
        working_copy = _working_copy(db, project_id)

        def torn_write(*args, **kwargs):
            working_copy.write_text("")
            raise HTTPException(status_code=500, detail="Error saving file")

        monkeypatch.setattr(projects_endpoint, "save_table_safe", torn_write)
        response = _undo(client, project_id)

        assert response.status_code == 500
        assert self._snapshot_state(client, db, project_id) == before

    def test_failed_commit_during_redo(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)

        _fail_next_commit(monkeypatch, db, RuntimeError("commit failed"))
        with pytest.raises(RuntimeError, match="commit failed"):
            _redo(client, project_id)

        assert self._snapshot_state(client, db, project_id) == before
        assert _redo(client, project_id).status_code == 200

    def test_failed_restore_during_redo(self, client, db, monkeypatch):
        project_id = self._with_redo_stack(client)
        before = self._snapshot_state(client, db, project_id)

        def locked(*args, **kwargs):
            raise PermissionError("file is open in another process")

        monkeypatch.setattr(projects_endpoint, "restore_snapshot", locked)
        response = _redo(client, project_id)

        assert response.status_code == 500
        assert response.json()["detail"] == "Could not redo; please retry."
        assert self._snapshot_state(client, db, project_id) == before


class TestReadsAfterUndoAndRedo:
    def test_get_serves_restored_data_not_a_stale_cache(self, client):
        project_id = _upload(client)
        original_rows = _rows(client, project_id)
        _transform(client, project_id, DELETE_FIRST_ROW)
        deleted_rows = _rows(client, project_id)

        _undo(client, project_id)
        assert _rows(client, project_id) == original_rows

        _redo(client, project_id)
        assert _rows(client, project_id) == deleted_rows

    def test_same_length_cell_edit_is_undone_on_the_next_read(self, client):
        """The restored file can match the edited one in size, so only the
        fingerprint's inode and mtime tell the cache apart."""
        project_id = _upload(client, b"name,age\nAlice,3\nBob,25\n")
        assert _rows(client, project_id)[0] == ["Alice", 3]
        _transform(client, project_id, _edit_cell(0, 2, 4))
        assert _rows(client, project_id)[0] == ["Alice", 4]

        _undo(client, project_id)
        assert _rows(client, project_id)[0] == ["Alice", 3]

        _redo(client, project_id)
        assert _rows(client, project_id)[0] == ["Alice", 4]

    def test_undo_and_redo_do_not_reparse_a_warm_working_copy(self, client, monkeypatch):
        """The restored bytes are a copy of a file whose parsed frame is cached,
        so neither the response nor the next GET parses again. The UI reloads
        the table after every persisted transform, which is what warms the cache."""
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _rows(client, project_id)
        calls = []
        original = pandas_helpers._read_and_infer

        def counting(path):
            calls.append(path)
            return original(path)

        monkeypatch.setattr(pandas_helpers, "_read_and_infer", counting)

        _undo(client, project_id)
        _rows(client, project_id)
        _redo(client, project_id)
        _rows(client, project_id)

        assert calls == []


class TestNonChanges:
    def test_preview_and_noop_edit_keep_the_redo_stack(self, client):
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)
        _undo(client, project_id)
        files = _snapshot_files(project_id)

        _transform(client, project_id, FILTER_AGE_OVER_26, preview=True)
        _transform(client, project_id, _edit_cell(0, 1, "Alice"))

        assert _snapshot_files(project_id) == files
        assert _state(client, project_id) == {"can_undo": False, "can_redo": True}
        assert _redo(client, project_id).status_code == 200


class TestUndoState:
    def test_state_follows_the_flow(self, client):
        project_id = _upload(client)
        assert _state(client, project_id) == {"can_undo": False, "can_redo": False}

        _transform(client, project_id, SORT_BY_AGE)
        assert _state(client, project_id) == {"can_undo": True, "can_redo": False}

        _undo(client, project_id)
        assert _state(client, project_id) == {"can_undo": False, "can_redo": True}

        _redo(client, project_id)
        assert _state(client, project_id) == {"can_undo": True, "can_redo": False}

        client.post(f"/projects/{project_id}/save", params={"commit_message": "x"})
        assert _state(client, project_id) == {"can_undo": False, "can_redo": False}

    def test_other_users_project_is_hidden(self, client, db):
        other = models.User(email="other@test.com", password_hash="x")
        db.add(other)
        db.commit()
        project = models.Project(name="theirs", file_path="unused.csv", owner_id=other.id)
        db.add(project)
        db.commit()

        assert client.get(f"/projects/{project.project_id}/undo-state").status_code == 404
        assert client.post(f"/projects/{project.project_id}/redo").status_code == 404
