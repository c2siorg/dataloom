"""Test configuration and fixtures for the DataLoom backend tests."""

import csv
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import Session, SQLModel, create_engine

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["AUTH_SECRET"] = "test-auth-secret-key-for-dataloom"
os.environ["TESTING"] = "true"

from app.database import get_async_session, get_db
from app.main import app

# Use SQLite for tests
TEST_DATABASE_URL = "sqlite:///./test.db"
TEST_ASYNC_DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
async_engine = create_async_engine(TEST_ASYNC_DATABASE_URL)
async_session_maker = async_sessionmaker(async_engine, expire_on_commit=False)


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
def anonymous_client(db):
    """Provide a test client without an authenticated session."""

    def override_get_db():
        try:
            yield db
        finally:
            pass

    async def override_get_async_session():
        async with async_session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_async_session] = override_get_async_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _register_and_login(client: TestClient, email: str, password: str) -> None:
    register_response = client.post("/auth/register", json={"email": email, "password": password})
    assert register_response.status_code == 201, register_response.text

    login_response = client.post("/auth/jwt/login", data={"username": email, "password": password})
    assert login_response.status_code == 204, login_response.text


@pytest.fixture
def client(anonymous_client):
    """Provide an authenticated test client for project endpoints."""
    _register_and_login(anonymous_client, "test@example.com", "StrongPass123!")
    return anonymous_client


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
