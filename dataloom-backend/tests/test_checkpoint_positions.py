"""End-to-end tests for checkpoints that point at a change-log position.

The regression these pin: a checkpoint is a *position* in the change log, not a
*group* of rows, so restoring one replays the log up to that position no matter
what was saved, reverted to or deleted since.
"""

import uuid

import pytest
import sqlalchemy as sa
from sqlmodel import Session, SQLModel, create_engine

from app import models
from app.config import get_settings
from app.services import project_service, replay_service
from app.services.project_service import create_checkpoint

PEOPLE_CSV = b"name,age,city\nAlice,30,NY\nBob,25,LA\nCharlie,35,SF\n"

# The serialized ``action_details`` each transform logs.
FILTER_DETAILS = {"parameters": {"column": "age", "condition": ">", "value": "29"}}
RENAME_DETAILS = {"rename_col_params": {"col_index": 2, "new_name": "town"}}
ADD_COL_DETAILS = {"add_col_params": {"index": 3, "name": "country"}}
SORT_DETAILS = {"sort_params": {"column": "age", "ascending": True}}

FILTER_AGE_OVER_29 = {"operation_type": "filter", **FILTER_DETAILS}
RENAME_CITY = {"operation_type": "renameCol", **RENAME_DETAILS}
ADD_COUNTRY = {"operation_type": "addCol", **ADD_COL_DETAILS}
SORT_BY_AGE = {"operation_type": "sort", **SORT_DETAILS}

# filter leaves Alice (30) and Charlie (35) out of the three uploaded rows.
FILTERED_NAMES = ["Alice", "Charlie"]
EVERY_NAME = ["Alice", "Bob", "Charlie"]


def _log_rows(db, project_id, specs, ids=None):
    """Insert log rows directly, so their ids are exactly the ones given."""
    rows = []
    for index, (action_type, details) in enumerate(specs):
        row = models.ProjectChangeLog(
            change_log_id=ids[index] if ids is not None else None,
            project_id=project_id,
            action_type=action_type,
            action_details=details,
            applied=True,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    return rows


@pytest.fixture(autouse=True)
def _isolated_upload_dir(tmp_path, monkeypatch):
    """Keep uploads and snapshots in a per-test directory, so file counts are exact."""
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "uploads"))


def _upload(client) -> str:
    response = client.post(
        "/projects/upload",
        files={"file": ("people.csv", PEOPLE_CSV, "text/csv")},
        data={"projectName": "Checkpoints", "projectDescription": "checkpoint positions"},
    )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def _transform(client, project_id: str, payload: dict):
    response = client.post(f"/projects/{project_id}/transform", json=payload)
    assert response.status_code == 200, response.text


def _save(client, project_id: str, message: str) -> str:
    """Save, and return the id of the checkpoint that save created."""
    known = {checkpoint["id"] for checkpoint in _checkpoint_list(client, project_id)}
    response = client.post(f"/projects/{project_id}/save", params={"commit_message": message})
    assert response.status_code == 200, response.text
    created = [c for c in _checkpoint_list(client, project_id) if c["id"] not in known]
    assert len(created) == 1, f"expected one new checkpoint, got {created}"
    return created[0]["id"]


def _revert_to(client, project_id: str, checkpoint_id: str) -> dict:
    response = client.post(f"/projects/{project_id}/revert", params={"checkpoint_id": checkpoint_id})
    assert response.status_code == 200, response.text
    return response.json()


def _full_revert(client, project_id: str) -> dict:
    response = client.post(f"/projects/{project_id}/revert")
    assert response.status_code == 200, response.text
    return response.json()


def _columns(client, project_id: str) -> list[str]:
    return client.get(f"/projects/get/{project_id}").json()["columns"]


def _names(client, project_id: str) -> list[str]:
    """The name column of the working copy, in row order."""
    rows = client.get(f"/projects/get/{project_id}").json()["rows"]
    return [row[0] for row in rows]


def _checkpoint_list(client, project_id: str) -> list[dict]:
    return client.get(f"/logs/checkpoints/{project_id}").json()


def _logs(client, project_id: str) -> list[dict]:
    return sorted(client.get(f"/logs/{project_id}").json(), key=lambda log: log["id"])


class TestRevertGivesTheDataThatWasSaved:
    def test_the_report_from_the_issue(self, client):
        """Filter, save A, rename, save B, revert to A, transform, save C."""
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        checkpoint_a = _save(client, project_id, "A")

        _transform(client, project_id, RENAME_CITY)
        checkpoint_b = _save(client, project_id, "B")
        assert _columns(client, project_id) == ["name", "age", "town"]

        _revert_to(client, project_id, checkpoint_a)
        assert _columns(client, project_id) == ["name", "age", "city"]
        assert _names(client, project_id) == FILTERED_NAMES

        _transform(client, project_id, ADD_COUNTRY)
        checkpoint_c = _save(client, project_id, "C")
        assert _columns(client, project_id) == ["name", "age", "city", "country"]

        _revert_to(client, project_id, checkpoint_a)
        assert _columns(client, project_id) == ["name", "age", "city"]
        assert _names(client, project_id) == FILTERED_NAMES

        # The rename from B must not come riding along with C's data.
        _revert_to(client, project_id, checkpoint_c)
        assert _columns(client, project_id) == ["name", "age", "city", "country"]
        assert _names(client, project_id) == FILTERED_NAMES

        # B is untouched by everything that came after it.
        _revert_to(client, project_id, checkpoint_b)
        assert _columns(client, project_id) == ["name", "age", "town"]
        assert _names(client, project_id) == FILTERED_NAMES

    def test_a_full_revert_is_also_a_log_row(self, client):
        """Rows the user rewound past must not rejoin through a later save."""
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        _save(client, project_id, "filtered")

        _full_revert(client, project_id)

        _transform(client, project_id, SORT_BY_AGE)
        sorted_only = _save(client, project_id, "sorted only")

        restored = _revert_to(client, project_id, sorted_only)
        # The original three rows, sorted Ã¢â‚¬â€ not the filtered two.
        assert _columns(client, project_id) == ["name", "age", "city"]
        assert [row[0] for row in restored["rows"]] == ["Bob", "Alice", "Charlie"]

    def test_deleting_an_earlier_checkpoint_leaves_later_ones_intact(self, client):
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        first = _save(client, project_id, "A")

        _transform(client, project_id, RENAME_CITY)
        checkpoint_b = _save(client, project_id, "B")

        assert client.delete(f"/logs/checkpoints/{project_id}/{first}").status_code == 200

        _revert_to(client, project_id, checkpoint_b)
        assert _columns(client, project_id) == ["name", "age", "town"]
        assert _names(client, project_id) == FILTERED_NAMES

    def test_deleting_a_checkpoint_a_revert_row_points_at(self, client):
        """The revert row stores where it went, so deleting that target is harmless."""
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        checkpoint_a = _save(client, project_id, "A")

        _transform(client, project_id, RENAME_CITY)
        _save(client, project_id, "B")

        _revert_to(client, project_id, checkpoint_a)
        _transform(client, project_id, ADD_COUNTRY)
        checkpoint_c = _save(client, project_id, "C")

        assert client.delete(f"/logs/checkpoints/{project_id}/{checkpoint_a}").status_code == 200

        assert (
            client.post(
                f"/projects/{project_id}/revert",
                params={"checkpoint_id": checkpoint_a},
            ).status_code
            == 404
        )

        _revert_to(client, project_id, checkpoint_c)
        assert _columns(client, project_id) == ["name", "age", "city", "country"]
        assert _names(client, project_id) == FILTERED_NAMES

    def test_a_checkpoint_taken_before_any_transform_holds_the_original(self, client):
        project_id = _upload(client)
        untouched = _save(client, project_id, "nothing yet")

        _transform(client, project_id, RENAME_CITY)

        _revert_to(client, project_id, untouched)
        assert _columns(client, project_id) == ["name", "age", "city"]
        assert _names(client, project_id) == EVERY_NAME

    def test_reverting_leaves_nothing_to_undo(self, client):
        project_id = _upload(client)
        _transform(client, project_id, SORT_BY_AGE)

        _full_revert(client, project_id)

        assert client.get(f"/projects/{project_id}/undo-state").json() == {"can_undo": False, "can_redo": False}

    def test_undo_after_a_revert_rebuilds_from_the_reverted_state(self, client):
        """Undo reverses the last unsaved change, not the work the user rewound past."""
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        _full_revert(client, project_id)
        _transform(client, project_id, SORT_BY_AGE)
        assert _names(client, project_id) == ["Bob", "Alice", "Charlie"]

        assert client.post(f"/projects/{project_id}/undo").status_code == 200

        assert _names(client, project_id) == EVERY_NAME
        assert _columns(client, project_id) == ["name", "age", "city"]


class TestRevertIsLoggedAsARow:
    def test_the_revert_row_records_where_it_went(self, client):
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        checkpoint_a = _save(client, project_id, "A")

        _revert_to(client, project_id, checkpoint_a)

        revert_row = _logs(client, project_id)[-1]
        assert revert_row["action_type"] == replay_service.REVERT_ACTION_TYPE
        assert revert_row["action_details"] == {"checkpoint_id": checkpoint_a, "log_position": 1}

    def test_the_earlier_rows_stay_in_the_log(self, client):
        project_id = _upload(client)
        _transform(client, project_id, FILTER_AGE_OVER_29)
        checkpoint_a = _save(client, project_id, "A")
        _transform(client, project_id, RENAME_CITY)
        _save(client, project_id, "B")

        _revert_to(client, project_id, checkpoint_a)

        assert [log["action_type"] for log in _logs(client, project_id)] == ["filter", "renameCol", "revert"]

    def test_a_full_revert_row_points_at_the_original(self, client):
        project_id = _upload(client)
        _full_revert(client, project_id)

        revert_row = _logs(client, project_id)[-1]
        assert revert_row["action_type"] == replay_service.REVERT_ACTION_TYPE
        assert revert_row["action_details"] == {"checkpoint_id": None, "log_position": None}


class TestReplayService:
    """The replay rules, without the endpoints in the way."""

    def _project(self, db, test_user, tmp_path):
        original = tmp_path / "people.csv"
        original.write_bytes(PEOPLE_CSV)
        project = models.Project(name="Replay", file_path=str(original), owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        return project, str(original)

    def test_a_revert_row_replaces_the_data_before_replay_continues(self, db, test_user, tmp_path):
        project, original = self._project(db, test_user, tmp_path)
        _log_rows(
            db,
            project.project_id,
            [
                ("filter", FILTER_DETAILS),
                ("revert", replay_service.revert_action_details(uuid.uuid4(), 1)),
                ("sort", SORT_DETAILS),
            ],
        )
        assert [row.change_log_id for row in replay_service.load_log_rows(db, project.project_id)] == [1, 2, 3]

        restored = replay_service.restore_checkpoint_state(db, project.project_id, original, 3)

        # The checkpoint the revert went back to was the filter, so replaying
        # past the revert lands there and only the sort after it applies.
        assert list(restored.columns) == ["name", "age", "city"]
        assert restored["name"].tolist() == FILTERED_NAMES

    def test_a_revert_row_rewinds_the_data_but_not_the_log(self, db, test_user, tmp_path):
        """The row the revert rewound past stays in the log and is not replayed."""
        project, original = self._project(db, test_user, tmp_path)
        _log_rows(
            db,
            project.project_id,
            [
                ("filter", FILTER_DETAILS),
                ("renameCol", RENAME_DETAILS),
                ("revert", replay_service.revert_action_details(uuid.uuid4(), 1)),
            ],
        )

        restored = replay_service.restore_checkpoint_state(db, project.project_id, original, 3)

        assert list(restored.columns) == ["name", "age", "city"]
        assert restored["name"].tolist() == FILTERED_NAMES

    def test_replaying_only_stops_at_the_position(self, db, test_user, tmp_path):
        project, original = self._project(db, test_user, tmp_path)
        _log_rows(
            db,
            project.project_id,
            [("filter", FILTER_DETAILS), ("renameCol", RENAME_DETAILS)],
        )

        restored = replay_service.restore_checkpoint_state(db, project.project_id, original, 1)

        assert list(restored.columns) == ["name", "age", "city"]
        assert restored["name"].tolist() == FILTERED_NAMES

    def test_an_unreachable_target_position_is_an_error(self, db, test_user, tmp_path):
        project, original = self._project(db, test_user, tmp_path)
        _log_rows(db, project.project_id, [("revert", replay_service.revert_action_details(None, 99))])

        with pytest.raises(ValueError, match="never reached"):
            replay_service.restore_checkpoint_state(db, project.project_id, original, 1)

    def test_a_null_position_restores_the_original_file(self, db, test_user, tmp_path):
        project, original = self._project(db, test_user, tmp_path)
        _log_rows(db, project.project_id, [("filter", FILTER_DETAILS)])

        restored = replay_service.restore_checkpoint_state(db, project.project_id, original, None)

        assert restored["name"].tolist() == EVERY_NAME


class TestCheckpointService:
    def _project(self, db, test_user, file_path="/tmp/p.csv"):
        project = models.Project(name="Saves", file_path=file_path, owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    def test_a_save_with_no_new_rows_keeps_the_previous_position(self, db, test_user):
        project = self._project(db, test_user)
        db.add(
            models.ProjectChangeLog(
                project_id=project.project_id,
                action_type="filter",
                action_details=FILTER_DETAILS,
                applied=True,
            )
        )
        db.commit()

        first = create_checkpoint(db, project.project_id, "first")
        second = create_checkpoint(db, project.project_id, "second")

        assert first.log_position == second.log_position == 1

    def test_a_save_with_an_empty_log_points_nowhere(self, db, test_user):
        project = self._project(db, test_user)

        assert create_checkpoint(db, project.project_id, "nothing yet").log_position is None

    def test_a_position_over_a_gap_still_replays_the_rows_below_it(self, db, test_user, tmp_path):
        """Rows deleted by undo leave gaps, and a position must step over one."""
        original = tmp_path / "people.csv"
        original.write_bytes(PEOPLE_CSV)
        copy = tmp_path / "copy.csv"
        copy.write_bytes(PEOPLE_CSV)
        project = self._project(db, test_user, str(copy))

        _log_rows(
            db,
            project.project_id,
            [
                ("sort", SORT_DETAILS),
                ("renameCol", RENAME_DETAILS),
                ("addCol", ADD_COL_DETAILS),
            ],
            ids=[1, 5, 9],
        )

        checkpoint = create_checkpoint(db, project.project_id, "after a gap")
        assert checkpoint.log_position == 9

        restored = replay_service.restore_checkpoint_state(db, project.project_id, str(original), 9)
        assert list(restored.columns) == ["name", "age", "town", "country"]
        assert restored["name"].tolist() == ["Bob", "Alice", "Charlie"]

    def test_a_save_touches_the_project(self, db, test_user):
        project = self._project(db, test_user)
        project.last_modified = None
        db.add(project)
        db.commit()

        create_checkpoint(db, project.project_id, "touch")

        assert project.last_modified is not None

    def test_deleting_a_project_removes_checkpoints_before_the_log(self, tmp_path):
        """The position is a real foreign key, so the delete order matters.

        The suite's SQLite engine does not enforce foreign keys and cannot add
        one after the fact, so this builds its own engine that does, to catch a
        ``delete_project`` that drops log rows a checkpoint still points at.
        """
        engine = create_engine("sqlite://", poolclass=sa.pool.StaticPool)
        sa.event.listen(engine, "connect", lambda conn, _: conn.cursor().execute("PRAGMA foreign_keys=ON"))
        SQLModel.metadata.create_all(engine)

        try:
            with Session(engine) as session:
                user = models.User(email="fk@test.com", password_hash="x")
                session.add(user)
                session.commit()
                session.refresh(user)

                project = models.Project(name="FK", file_path=str(tmp_path / "p.csv"), owner_id=user.id)
                session.add(project)
                session.commit()
                session.refresh(project)

                _log_rows(session, project.project_id, [("sort", SORT_DETAILS)])
                create_checkpoint(session, project.project_id, "saved")

                project_service.delete_project(session, project)

                assert session.query(models.Checkpoint).count() == 0
                assert session.query(models.ProjectChangeLog).count() == 0
        finally:
            engine.dispose()
