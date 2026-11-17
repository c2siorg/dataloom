"""API regression coverage for preview-bound working-copy revisions."""

import uuid
from pathlib import Path

import pytest

from app import models
from app.services.project_service import commit_undoable_change, lock_working_copy_revision
from app.utils.pandas_helpers import read_table_safe


def _upload(client, sample_csv):
    with open(sample_csv, "rb") as file:
        response = client.post(
            "/projects/upload",
            files={"file": ("revision.csv", file, "text/csv")},
            data={"projectName": "Revision test", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def _revision(db, project_id):
    project = db.get(models.Project, uuid.UUID(project_id))
    db.refresh(project)
    return project.working_copy_revision


def test_preview_revision_is_retained_for_a_matching_commit(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    payload = {"operation_type": "delRow", "row_params": {"index": 1}}

    preview = client.post(f"/projects/{project_id}/transform?preview=true", json=payload)
    assert preview.status_code == 200, preview.text
    assert preview.json()["working_copy_revision"] == 0

    committed = client.post(
        f"/projects/{project_id}/transform?expected_revision=0",
        json=payload,
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["working_copy_revision"] == 1
    assert _revision(db, project_id) == 1


def test_stale_commit_changes_nothing(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    payload = {"operation_type": "delRow", "row_params": {"index": 1}}
    preview = client.post(f"/projects/{project_id}/transform?preview=true", json=payload)
    assert preview.status_code == 200

    first_commit = client.post(f"/projects/{project_id}/transform", json=payload)
    assert first_commit.status_code == 200
    working_path = db.get(models.Project, uuid.UUID(project_id)).file_path
    bytes_before = Path(working_path).read_bytes()
    logs_before = db.query(models.ProjectChangeLog).filter_by(project_id=uuid.UUID(project_id)).count()
    undo_before = db.query(models.UndoStep).filter_by(project_id=uuid.UUID(project_id)).count()
    checkpoints_before = db.query(models.Checkpoint).filter_by(project_id=uuid.UUID(project_id)).count()

    stale = client.post(
        f"/projects/{project_id}/transform?expected_revision=0",
        json=payload,
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "stale_dataset_revision"
    assert _revision(db, project_id) == 1
    assert Path(working_path).read_bytes() == bytes_before
    assert db.query(models.ProjectChangeLog).filter_by(project_id=uuid.UUID(project_id)).count() == logs_before
    assert db.query(models.UndoStep).filter_by(project_id=uuid.UUID(project_id)).count() == undo_before
    assert db.query(models.Checkpoint).filter_by(project_id=uuid.UUID(project_id)).count() == checkpoints_before


def test_database_commit_failure_rolls_back_file_history_and_revision(client, sample_csv, db, monkeypatch):
    project_id = _upload(client, sample_csv)
    project_uuid = uuid.UUID(project_id)
    project = db.get(models.Project, project_uuid)
    original_bytes = Path(project.file_path).read_bytes()
    df = read_table_safe(project.file_path)
    result_df = df.iloc[:-1].copy()
    lock_working_copy_revision(db, project_uuid)

    def fail_commit():
        raise RuntimeError("controlled commit failure")

    monkeypatch.setattr(db, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="controlled commit failure"):
        commit_undoable_change(db, project, result_df, [("delRow", {"row_params": {"index": 3}})])

    db.rollback()
    assert Path(project.file_path).read_bytes() == original_bytes
    assert _revision(db, project_id) == 0
    assert db.query(models.ProjectChangeLog).filter_by(project_id=project_uuid).count() == 0
    assert db.query(models.UndoStep).filter_by(project_id=project_uuid).count() == 0


def test_failed_and_noop_transformations_do_not_advance_revision(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    failed = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "filter", "parameters": {"column": "missing", "condition": "=", "value": "x"}},
    )
    assert failed.status_code == 400
    assert _revision(db, project_id) == 0

    noop = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "changeCellValue",
            "change_cell_value": {"col_index": 1, "row_index": 0, "fill_value": "Alice"},
        },
    )
    assert noop.status_code == 200, noop.text
    assert noop.json()["working_copy_revision"] == 0
    assert _revision(db, project_id) == 0
    assert db.query(models.UndoStep).filter_by(project_id=uuid.UUID(project_id)).count() == 0


def test_successful_cell_edit_advances_revision(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "changeCellValue",
            "change_cell_value": {"col_index": 1, "row_index": 0, "fill_value": "31"},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["working_copy_revision"] == 1
    assert _revision(db, project_id) == 1


def test_append_undo_redo_revert_and_reset_advance_revision(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    assert _revision(db, project_id) == 0

    appended = client.post(
        f"/projects/{project_id}/files",
        files={"file": ("more.csv", b"name,age,city\nDora,40,Paris\n", "text/csv")},
    )
    assert appended.status_code == 200, appended.text
    assert _revision(db, project_id) == 1

    assert client.post(f"/projects/{project_id}/undo").status_code == 200
    assert _revision(db, project_id) == 2
    assert client.post(f"/projects/{project_id}/redo").status_code == 200
    assert _revision(db, project_id) == 3
    assert client.post(f"/projects/{project_id}/revert").status_code == 200
    assert _revision(db, project_id) == 4
    assert client.post(f"/projects/{project_id}/reset").status_code == 200
    assert _revision(db, project_id) == 5


def test_revision_default_is_safe_for_existing_project_records(client, sample_csv, db):
    project_id = _upload(client, sample_csv)
    project = db.get(models.Project, uuid.UUID(project_id))
    assert project.working_copy_revision == 0
    assert read_table_safe(project.file_path).shape == (4, 3)
