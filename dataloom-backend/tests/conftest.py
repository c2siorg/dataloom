"""Test configuration and fixtures for the DataLoom backend tests."""

import csv
import io
import os
from io import BytesIO
from unittest.mock import patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, StaticPool, create_engine

# Set DATABASE_URL before importing app so config picks up SQLite
os.environ["DATABASE_URL"] = "sqlite://"

from app.database import get_db  # noqa: E402
from app.main import app  # noqa: E402

TEST_DATABASE_URL = "sqlite://"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


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
def client(db):
    """Provide a FastAPI test client with SQLite and no Alembic migration."""
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with patch("alembic.command.upgrade"), TestClient(app) as c:
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


# ── upload helpers ────────────────────────────────────────────────────────────

def _upload_csv(client, rows: list[dict], name: str = "test") -> dict:
    """Helper: upload a CSV dataset and return the response JSON."""
    if not rows:
        content = b"col1,col2\n1,a\n2,b\n3,c\n"
    else:
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
        content = buf.getvalue().encode()

    resp = client.post(
        "/projects/upload",
        data={"projectName": name, "projectDescription": "test fixture"},
        files={"file": (f"{name}.csv", BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()


@pytest.fixture
def uploaded_csv_project(client):
    """Upload a clean CSV dataset (no nulls, no duplicates)."""
    rows = [
        {"name": "Alice", "score": 90, "city": "Delhi"},
        {"name": "Bob",   "score": 85, "city": "Mumbai"},
        {"name": "Carol", "score": 92, "city": "Pune"},
    ]
    return _upload_csv(client, rows, name="clean_data")


@pytest.fixture
def uploaded_numeric_project(client):
    """Upload a CSV with numeric columns for stats testing."""
    rows = [
        {"value": 10, "price": 1.5, "quantity": 100},
        {"value": 20, "price": 2.5, "quantity": 200},
        {"value": 30, "price": 3.5, "quantity": 300},
        {"value": 40, "price": 4.5, "quantity": 400},
        {"value": 50, "price": 5.5, "quantity": 500},
    ]
    return _upload_csv(client, rows, name="numeric_data")


@pytest.fixture
def uploaded_duplicate_project(client):
    """Upload a CSV that contains duplicate rows."""
    rows = [
        {"name": "Alice", "score": 90},
        {"name": "Bob",   "score": 85},
        {"name": "Alice", "score": 90},  # exact duplicate
        {"name": "Alice", "score": 90},  # exact duplicate again
    ]
    return _upload_csv(client, rows, name="duplicate_data")


@pytest.fixture
def uploaded_nulls_project(client):
    """Upload a CSV that contains null/empty values."""
    content = b"name,score,city\nAlice,90,Delhi\nBob,,Mumbai\n,85,\n"
    resp = client.post(
        "/projects/upload",
        data={"projectName": "nulls_data", "projectDescription": "nulls fixture"},
        files={"file": ("nulls_data.csv", BytesIO(content), "text/csv")},
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()


@pytest.fixture
def uploaded_xlsx_project(client):
    """Upload an Excel dataset."""
    buf = BytesIO()
    pd.DataFrame({
        "product": ["Widget", "Gadget", "Doohickey"],
        "units":   [100, 200, 150],
        "price":   [9.99, 19.99, 4.99],
    }).to_excel(buf, index=False)
    buf.seek(0)

    resp = client.post(
        "/projects/upload",
        data={"projectName": "excel_data", "projectDescription": "xlsx fixture"},
        files={
            "file": (
                "excel_data.xlsx",
                buf,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()


@pytest.fixture
def uploaded_json_project(client):
    """Upload a JSON dataset."""
    content = b'[{"col1": 1, "col2": "a"}, {"col1": 2, "col2": "b"}, {"col1": 3, "col2": "c"}]'
    resp = client.post(
        "/projects/upload",
        data={"projectName": "json_data", "projectDescription": "json fixture"},
        files={"file": ("json_data.json", BytesIO(content), "application/json")},
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()


@pytest.fixture
def uploaded_parquet_project(client):
    """Upload a Parquet dataset."""
    buf = BytesIO()
    pd.DataFrame({"x": [1, 2, 3], "y": [4.0, 5.0, 6.0]}).to_parquet(buf, index=False)
    buf.seek(0)

    resp = client.post(
        "/projects/upload",
        data={"projectName": "parquet_data", "projectDescription": "parquet fixture"},
        files={"file": ("parquet_data.parquet", buf, "application/octet-stream")},
    )
    assert resp.status_code == 200, f"Upload failed: {resp.text}"
    return resp.json()