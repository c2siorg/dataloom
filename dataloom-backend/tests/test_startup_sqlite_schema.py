"""Regression tests for backend startup schema initialization."""

from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlmodel import create_engine


def test_lifespan_initializes_sqlite_schema(tmp_path, monkeypatch):
    """Startup should create SQLite tables when Alembic is skipped."""
    from app import database as database_module
    from app import main as main_module

    db_path = tmp_path / "startup_regression.db"
    upload_dir = tmp_path / "uploads"
    sqlite_url = f"sqlite:///{db_path}"

    temp_engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
    monkeypatch.setattr(database_module, "engine", temp_engine)

    settings = SimpleNamespace(
        database_url=sqlite_url,
        upload_dir=str(upload_dir),
        debug=False,
        cors_origins=["http://localhost:3200"],
    )
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    monkeypatch.setattr(main_module, "setup_logging", lambda _debug: None)

    with TestClient(main_module.app):
        pass

    table_names = set(inspect(temp_engine).get_table_names())
    assert {"projects", "user_logs", "checkpoints"}.issubset(table_names)
    assert upload_dir.exists()
