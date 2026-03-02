"""Tests for new features: rename column, cast data type, export, and delete project."""

import csv

import pandas as pd
import pytest

from app.services.transformation_service import (
    TransformationError,
    apply_logged_transformation,
    cast_data_type,
    rename_column,
)


@pytest.fixture
def sample_df():
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [30, 25, 35],
            "city": ["New York", "Los Angeles", "Chicago"],
        }
    )


# --- Rename Column Tests ---


class TestRenameColumn:
    def test_rename_column_basic(self, sample_df):
        result = rename_column(sample_df, 0, "full_name")
        assert "full_name" in result.columns
        assert "name" not in result.columns
        assert result.iloc[0]["full_name"] == "Alice"

    def test_rename_column_middle(self, sample_df):
        result = rename_column(sample_df, 1, "years")
        assert list(result.columns) == ["name", "years", "city"]

    def test_rename_column_index_out_of_range(self, sample_df):
        with pytest.raises(TransformationError, match="out of range"):
            rename_column(sample_df, 5, "new")

    def test_rename_column_negative_index(self, sample_df):
        with pytest.raises(TransformationError, match="out of range"):
            rename_column(sample_df, -1, "new")

    def test_rename_column_empty_name(self, sample_df):
        with pytest.raises(TransformationError, match="empty"):
            rename_column(sample_df, 0, "")

    def test_rename_column_whitespace_name(self, sample_df):
        with pytest.raises(TransformationError, match="empty"):
            rename_column(sample_df, 0, "   ")


# --- Cast Data Type Tests ---


class TestCastDataType:
    def test_cast_to_string(self, sample_df):
        result = cast_data_type(sample_df, "age", "string")
        assert str(result.iloc[0]["age"]) == "30"

    def test_cast_to_integer(self):
        df = pd.DataFrame({"val": ["10", "20", "30"]})
        result = cast_data_type(df, "val", "integer")
        assert result["val"].dtype == "Int64"
        assert result.iloc[0]["val"] == 10

    def test_cast_to_integer_with_nan(self):
        df = pd.DataFrame({"val": ["10", "abc", "30"]})
        result = cast_data_type(df, "val", "integer")
        assert pd.isna(result.iloc[1]["val"])
        assert result.iloc[0]["val"] == 10

    def test_cast_to_float(self):
        df = pd.DataFrame({"val": ["1.5", "2.7", "3.14"]})
        result = cast_data_type(df, "val", "float")
        assert result["val"].dtype == float
        assert result.iloc[2]["val"] == pytest.approx(3.14)

    def test_cast_to_boolean(self):
        df = pd.DataFrame({"val": ["true", "false", "yes", "no"]})
        result = cast_data_type(df, "val", "boolean")
        assert bool(result.iloc[0]["val"]) is True
        assert bool(result.iloc[1]["val"]) is False
        assert bool(result.iloc[2]["val"]) is True
        assert bool(result.iloc[3]["val"]) is False

    def test_cast_to_datetime(self):
        df = pd.DataFrame({"val": ["2024-01-01", "2024-06-15"]})
        result = cast_data_type(df, "val", "datetime")
        assert pd.api.types.is_datetime64_any_dtype(result["val"])

    def test_cast_invalid_column(self, sample_df):
        with pytest.raises(TransformationError, match="not found"):
            cast_data_type(sample_df, "nonexistent", "string")


# --- Log Replay Tests ---


class TestLogReplay:
    def test_replay_rename_column(self, sample_df):
        details = {"rename_col_params": {"col_index": 0, "new_name": "full_name"}}
        result = apply_logged_transformation(sample_df, "renameCol", details)
        assert "full_name" in result.columns

    def test_replay_cast_data_type(self, sample_df):
        details = {"cast_data_type_params": {"column": "age", "target_type": "string"}}
        result = apply_logged_transformation(sample_df, "castDataType", details)
        assert str(result.iloc[0]["age"]) == "30"


# --- Export Endpoint Tests ---


class TestExportEndpoint:
    def test_export_project(self, client, sample_csv, db):
        # Upload a project first
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Export Test", "projectDescription": "Test export"},
            )
        assert response.status_code == 200
        project_id = response.json()["project_id"]

        # Export the project
        export_response = client.get(f"/projects/{project_id}/export")
        assert export_response.status_code == 200
        assert export_response.headers["content-type"] == "text/csv; charset=utf-8"

        # Verify content is valid CSV
        content = export_response.content.decode("utf-8")
        reader = csv.reader(content.strip().splitlines())
        rows = list(reader)
        assert rows[0] == ["name", "age", "city"]
        assert len(rows) == 5  # header + 4 data rows

    def test_export_nonexistent_project(self, client):
        response = client.get("/projects/00000000-0000-0000-0000-000000000000/export")
        assert response.status_code == 404


# --- Delete Endpoint Tests ---


class TestDeleteEndpoint:
    def test_delete_column_accepts_index_only_params(self, client, sample_csv, db):
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Delete Column Test", "projectDescription": "Regression test"},
            )
        assert response.status_code == 200
        project_id = response.json()["project_id"]

        transform_response = client.post(
            f"/projects/{project_id}/transform",
            json={"operation_type": "delCol", "col_params": {"index": 0}},
        )
        assert transform_response.status_code == 200
        payload = transform_response.json()
        assert payload["columns"] == ["age", "city"]

    def test_delete_project(self, client, sample_csv, db):
        # Upload a project first
        with open(sample_csv, "rb") as f:
            response = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": "Delete Test", "projectDescription": "Test delete"},
            )
        assert response.status_code == 200
        project_id = response.json()["project_id"]

        # Delete the project
        delete_response = client.delete(f"/projects/{project_id}")
        assert delete_response.status_code == 200
        assert delete_response.json()["success"] is True

        # Verify project is gone
        get_response = client.get(f"/projects/get/{project_id}")
        assert get_response.status_code == 404

    def test_delete_nonexistent_project(self, client):
        response = client.delete("/projects/00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404
