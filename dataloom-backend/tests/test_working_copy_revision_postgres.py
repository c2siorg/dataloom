"""PostgreSQL integration coverage for preview revisions and row locking.

Set ``DATALOOM_POSTGRES_TEST_URL`` to a disposable PostgreSQL database URL to
run these tests. Each test migrates an isolated schema and drops it afterward;
the configured role must be allowed to create schemas and (on a fresh server)
the pgcrypto extension used by the repository's historical migrations.
"""

import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, make_url
from sqlmodel import Session

from alembic import command
from app import config as app_config
from app import database, models
from app.api.endpoints import transformations
from app.main import app
from app.services.auth_service import create_access_token
from app.services.file_service import delete_project_snapshots

# tests/conftest.py disables application-startup migrations for SQLite. Keep a
# reference to Alembic's real entry point before that fixture monkeypatches it.
_alembic_upgrade = command.upgrade
_alembic_downgrade = command.downgrade

BACKEND_ROOT = Path(__file__).resolve().parents[1]
PRE_REVISION = "c2f49b1e7a6d"


@pytest.fixture
def postgres_revision_project(tmp_path, monkeypatch):
    database_url = os.getenv("DATALOOM_POSTGRES_TEST_URL")
    if not database_url:
        pytest.skip("Set DATALOOM_POSTGRES_TEST_URL to a disposable PostgreSQL database to run integration tests")

    base_url = make_url(database_url)
    if base_url.get_backend_name() != "postgresql":
        pytest.fail("DATALOOM_POSTGRES_TEST_URL must use PostgreSQL; SQLite is not a concurrency substitute")

    schema_name = f"issue611_{uuid.uuid4().hex}"
    admin_engine = create_engine(base_url, pool_pre_ping=True)
    schema_engine = None
    schema_created = False
    try:
        with admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        schema_created = True

        query = dict(base_url.query)
        query["options"] = f"-csearch_path={schema_name},public"
        scoped_url: URL = base_url.set(query=query)
        schema_engine = create_engine(scoped_url, pool_pre_ping=True)

        monkeypatch.setattr(
            app_config,
            "get_settings",
            lambda: SimpleNamespace(database_url=scoped_url.render_as_string(hide_password=False).replace("%", "%%")),
        )
        alembic_config = Config(str(BACKEND_ROOT / "alembic.ini"))
        alembic_config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))

        # Prepare an existing project at the migration's parent revision, then
        # verify the upgrade safely initializes it and the downgrade removes it.
        _alembic_upgrade(alembic_config, PRE_REVISION)
        project_id = uuid.uuid4()
        with Session(schema_engine) as session:
            user = models.User(email=f"{schema_name}@test.invalid", password_hash="test")
            session.add(user)
            session.commit()
            owner_id = user.id
            session.execute(
                text(
                    "INSERT INTO projects "
                    "(project_id, name, description, file_path, owner_id) "
                    "VALUES (:project_id, :name, :description, :file_path, :owner_id)"
                ),
                {
                    "project_id": project_id,
                    "name": "revision integration fixture",
                    "description": "",
                    "file_path": str(tmp_path / "dataset_copy.csv"),
                    "owner_id": owner_id,
                },
            )
            session.commit()

        _alembic_upgrade(alembic_config, "head")
        with Session(schema_engine) as session:
            project = session.get(models.Project, project_id)
            assert project is not None
            assert project.working_copy_revision == 0

        _alembic_downgrade(alembic_config, PRE_REVISION)
        project_columns = {column["name"] for column in inspect(schema_engine).get_columns("projects")}
        assert "working_copy_revision" not in project_columns
        _alembic_upgrade(alembic_config, "head")
        with Session(schema_engine) as session:
            project = session.get(models.Project, project_id)
            assert project is not None
            assert project.working_copy_revision == 0

        original_path = tmp_path / "dataset.csv"
        working_path = tmp_path / "dataset_copy.csv"
        csv_data = "name,age\nAda,36\nLin,28\nGrace,44\nKatherine,30\n"
        original_path.write_text(csv_data)
        working_path.write_text(csv_data)
        with Session(schema_engine) as session:
            project = session.get(models.Project, project_id)
            assert project is not None
            project.file_path = str(working_path)
            session.commit()

        yield schema_engine, project_id, owner_id, working_path
    finally:
        if schema_engine is not None:
            schema_engine.dispose()
        if schema_created:
            with admin_engine.begin() as connection:
                connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
        admin_engine.dispose()


@pytest.fixture
def postgres_api(postgres_revision_project):
    engine, project_id, owner_id, working_path = postgres_revision_project
    sessions: list[Session] = []

    def override_db():
        session = Session(engine)
        sessions.append(session)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[database.get_db] = override_db
    token = create_access_token(owner_id)
    try:
        with TestClient(app) as client:
            client.headers["Cookie"] = f"access_token={token}"
            yield client, project_id, working_path, sessions
    finally:
        app.dependency_overrides.pop(database.get_db, None)
        delete_project_snapshots(project_id)


def _state(engine, project_id, working_path):
    with Session(engine) as session:
        project = session.get(models.Project, project_id)
        assert project is not None
        checkpoints = tuple(
            (str(row.id), row.message, row.last_change_log_id)
            for row in session.query(models.Checkpoint)
            .filter_by(project_id=project_id)
            .order_by(models.Checkpoint.created_at, models.Checkpoint.id)
            .all()
        )
        undo_redo = tuple(
            (row.id, row.status, row.before_path, row.after_path, repr(row.entries))
            for row in session.query(models.UndoStep)
            .filter_by(project_id=project_id)
            .order_by(models.UndoStep.id)
            .all()
        )
        changes = tuple(
            (
                row.change_log_id,
                row.action_type,
                repr(row.action_details),
                row.applied,
                str(row.checkpoint_id),
                row.undo_step_id,
            )
            for row in session.query(models.ProjectChangeLog)
            .filter_by(project_id=project_id)
            .order_by(models.ProjectChangeLog.change_log_id)
            .all()
        )
        metadata = tuple(
            (row.column_name, row.column_dtype)
            for row in session.query(models.ProjectColumnMetadata)
            .filter_by(project_id=project_id)
            .order_by(models.ProjectColumnMetadata.column_name)
            .all()
        )
        revision = project.working_copy_revision

    return {
        "bytes": working_path.read_bytes(),
        "revision": revision,
        "checkpoints": checkpoints,
        "undo_redo": undo_redo,
        "changes": changes,
        "metadata": metadata,
        "last_modified": project.last_modified,
    }


def test_postgres_migration_defaults_existing_projects_and_round_trips(postgres_revision_project):
    engine, project_id, _owner_id, _working_path = postgres_revision_project
    with Session(engine) as session:
        project = session.get(models.Project, project_id)
        assert project is not None
        assert project.working_copy_revision == 0
        assert "working_copy_revision" in {column["name"] for column in inspect(engine).get_columns("projects")}


def test_postgres_independent_commit_rejects_stale_preview_without_side_effects(postgres_api):
    client, project_id, working_path, sessions = postgres_api
    project_path = str(project_id)
    preview_payload = {"operation_type": "delRow", "row_params": {"index": 0}}

    checkpoint = client.post(f"/projects/{project_path}/save", params={"commit_message": "baseline"})
    assert checkpoint.status_code == 200, checkpoint.text
    preview = client.post(f"/projects/{project_path}/transform?preview=true", json=preview_payload)
    assert preview.status_code == 200, preview.text
    preview_revision = preview.json()["working_copy_revision"]
    assert preview_revision == 0

    # Each HTTP request gets its own SQLModel Session; this successful mutation
    # commits in a distinct session while the original preview remains pending.
    intervening = client.post(
        f"/projects/{project_path}/transform",
        json={"operation_type": "delRow", "row_params": {"index": 1}},
    )
    assert intervening.status_code == 200, intervening.text
    assert intervening.json()["working_copy_revision"] == 1
    assert client.post(f"/projects/{project_path}/undo").status_code == 200
    assert len(sessions) >= 4
    assert sessions[1] is not sessions[2]

    before = _state(sessions[0].get_bind(), project_id, working_path)
    stale = client.post(
        f"/projects/{project_path}/transform?expected_revision={preview_revision}",
        json=preview_payload,
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["detail"]["code"] == "stale_dataset_revision"
    assert _state(sessions[0].get_bind(), project_id, working_path) == before


def test_postgres_commit_with_current_preview_revision_succeeds(postgres_api):
    client, project_id, _working_path, _sessions = postgres_api
    project_path = str(project_id)
    payload = {"operation_type": "delRow", "row_params": {"index": 0}}

    preview = client.post(f"/projects/{project_path}/transform?preview=true", json=payload)
    assert preview.status_code == 200, preview.text
    revision = preview.json()["working_copy_revision"]

    committed = client.post(
        f"/projects/{project_path}/transform?expected_revision={revision}",
        json=payload,
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["working_copy_revision"] == revision + 1


def test_postgres_same_revision_commits_serialize_without_process_lock(postgres_api, monkeypatch):
    client, project_id, working_path, sessions = postgres_api
    payload = {"operation_type": "delRow", "row_params": {"index": 0}}
    revision_barrier = threading.Barrier(2)
    real_revision_lock = transformations.lock_working_copy_revision

    # Make both independent request sessions rendezvous before SELECT FOR
    # UPDATE, while disabling the process-local lock so PostgreSQL must serialize.
    def synchronized_revision_lock(db, target_project_id, *, shared=False):
        if not shared:
            revision_barrier.wait(timeout=10)
        return real_revision_lock(db, target_project_id, shared=shared)

    monkeypatch.setattr(transformations, "lock_working_copy_revision", synchronized_revision_lock)
    monkeypatch.setattr(transformations, "project_write_lock", lambda _project_id: nullcontext())

    def submit_commit():
        return client.post(
            f"/projects/{project_id}/transform?expected_revision=0",
            json=payload,
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(submit_commit), executor.submit(submit_commit)]
        outcomes = [future.result(timeout=20) for future in futures]

    assert sorted(response.status_code for response in outcomes) == [200, 409]
    assert len(sessions) >= 2
    assert sessions[-1] is not sessions[-2]
    state = _state(sessions[0].get_bind(), project_id, working_path)
    assert state["revision"] == 1
    assert len(state["changes"]) == 1
    assert len(state["undo_redo"]) == 1
