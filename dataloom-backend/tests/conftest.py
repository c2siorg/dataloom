"""Test configuration and fixtures for the DataLoom backend tests."""

import csv
import os

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_db

# Tests manage schema via SQLModel.metadata.create_all/drop_all, so skip
# Alembic during app startup unless explicitly overridden by the caller.
os.environ.setdefault("SKIP_MIGRATIONS", "1")

from app.main import app

# Use SQLite for tests
TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})


@pytest.fixture(autouse=True)
def _bypass_app_lifespan(monkeypatch):
    """Neutralize app lifespan hooks that require a real Postgres + Alembic setup.

    The conftest drives schema setup via SQLModel.metadata.create_all on SQLite,
    so the production startup steps (verify_database_connection + alembic upgrade)
    must not run when TestClient(app) enters the lifespan.
    """
    from alembic import command

    monkeypatch.setattr("app.main.verify_database_connection", lambda: None)
    monkeypatch.setattr(command, "upgrade", lambda *args, **kwargs: None)


@pytest.fixture(autouse=True)
def setup_database():
    """Create all tables before each test and drop them after."""
    SQLModel.metadata.create_all(bind=engine)
    yield
    SQLModel.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    """Provide a test database session."""
    with Session(engine) as session:
        yield session


@pytest.fixture
def client():
    """Provide a FastAPI test client with per-request DB sessions."""

    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def sample_csv(tmp_path):
    """Create a sample CSV file for testing."""
    csv_path = tmp_path / "test_data.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age", "city"])
        writer.writerow(["Alice", "30", "New York"])
        writer.writerow(["Bob", "25", "Los Angeles"])
        writer.writerow(["Charlie", "35", "Chicago"])
        writer.writerow(["Alice", "30", "New York"])  # Duplicate
    return csv_path


@pytest.fixture
def upload_dir(tmp_path):
    """Create a temporary upload directory."""
    upload_path = tmp_path / "uploads"
    upload_path.mkdir()
    return upload_path
