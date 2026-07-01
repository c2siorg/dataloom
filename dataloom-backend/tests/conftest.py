"""Test configuration and fixtures for the DataLoom backend tests."""

import csv
import os

# Auth-related settings must exist before app modules load the cached Settings.
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-key-for-the-dataloom-suite")
os.environ.setdefault("COOKIE_SECURE", "false")

os.environ.setdefault("SMTP_USERNAME", "test@example.com")
os.environ.setdefault("SMTP_PASSWORD", "test-password")
os.environ.setdefault("SMTP_FROM_EMAIL", "noreply@example.com")

os.environ["RATE_LIMIT_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session, SQLModel, create_engine  # noqa: E402

from app import models  # noqa: E402
from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.auth_service import create_access_token  # noqa: E402

# Use SQLite for tests
TEST_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})

# Test user credentials. The hash is a precomputed bcrypt hash (cost 4, for
# test speed) of TEST_USER_PASSWORD — avoids a slow cost-12 hash per test.
TEST_USER_EMAIL = "fixture-user@test.com"
TEST_USER_PASSWORD = "testpassword"
TEST_USER_PASSWORD_HASH = "$2b$04$jYCMf0hes4R2ULgo.pKfOOGumgg6nJBsRgXVMohokYq4.kF0c50K2"


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
def test_user(db):
    """Create and return a persisted user that owns test projects."""
    user = models.User(email=TEST_USER_EMAIL, password_hash=TEST_USER_PASSWORD_HASH)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def anon_client(db):
    """Provide an unauthenticated FastAPI test client."""

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def client(db, test_user):
    """Provide a FastAPI test client authenticated as `test_user`.

    The whole project API is auth-gated, so the default client carries a valid
    auth cookie. Use `anon_client` for tests that exercise unauthenticated paths.
    """

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    token = create_access_token(test_user.id)
    with TestClient(app) as c:
        # Set the auth cookie as a static header; httpx's cookie jar mangles
        # dotless hosts ("testserver" -> "testserver.local"), dropping the cookie.
        c.headers["Cookie"] = f"access_token={token}"
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
