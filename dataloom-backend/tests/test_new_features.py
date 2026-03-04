"""Tests for new features: rename column, cast data type, export, and delete project."""

import csv
import io

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


@pytest.fixture
def seeded_project(client, sample_csv):
    """Upload the sample CSV and return the project_id."""
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Export Test", "projectDescription": "Test export"},
        )
    assert response.status_code == 200
    return response.json()["project_id"]


@pytest.fixture
def seeded_unicode_project(client, tmp_path):
    """Upload a CSV that contains non-ASCII characters and return the project_id."""
    csv_path = tmp_path / "unicode_data.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "city"])
        writer.writerow(["Alice", "Köln"])   # ö — non-ASCII Latin
        writer.writerow(["Bob", "北京"])      # Chinese characters
    with open(csv_path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("unicode.csv", f, "text/csv")},
            data={"projectName": "Unicode Test", "projectDescription": "Test"},
        )
    assert response.status_code == 200
    return response.json()["project_id"]


class TestExportEndpoint:
    # --- Default (fast-path) ---

    def test_export_default_returns_valid_csv(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export")
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert "utf-8" in r.headers["content-type"]

        rows = list(csv.reader(r.content.decode("utf-8").strip().splitlines()))
        assert rows[0] == ["name", "age", "city"]
        assert len(rows) == 5  # header + 4 data rows

    def test_export_nonexistent_project(self, client):
        r = client.get("/projects/00000000-0000-0000-0000-000000000000/export")
        assert r.status_code == 404

    # --- Delimiter variants ---

    @pytest.mark.parametrize("delimiter,expected_sep", [
        ("comma",     b","),
        ("tab",       b"\t"),
        ("semicolon", b";"),
        ("pipe",      b"|"),
    ])
    def test_export_delimiter(self, client, seeded_project, delimiter, expected_sep):
        r = client.get(f"/projects/{seeded_project}/export?delimiter={delimiter}")
        assert r.status_code == 200
        assert expected_sep in r.content

    def test_export_invalid_delimiter_returns_422(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?delimiter=space")
        assert r.status_code == 422

    # --- Header toggle ---

    def test_export_no_header_omits_header_row(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?include_header=false")
        assert r.status_code == 200
        first_line = r.content.decode("utf-8").splitlines()[0]
        # Data row starts with "Alice", not the column name "name"
        assert first_line.startswith("Alice")

    def test_export_with_header_includes_header_row(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?include_header=true")
        assert r.status_code == 200
        first_line = r.content.decode("utf-8").splitlines()[0]
        assert first_line.startswith("name")

    # --- Encoding variants ---

    def test_export_latin1_encoding(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?encoding=latin-1")
        assert r.status_code == 200
        # ASCII-safe content should round-trip cleanly through Latin-1
        rows = list(csv.reader(r.content.decode("latin-1").strip().splitlines()))
        assert rows[0] == ["name", "age", "city"]

    def test_export_utf16le_encoding(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?encoding=utf-16-le")
        assert r.status_code == 200
        # UTF-16-LE has no BOM; the first two bytes are the first char of "name"
        assert r.content[:2] == "n".encode("utf-16-le")

    def test_export_utf16le_no_bom(self, client, seeded_project):
        """Confirm the BOM bytes FF FE are NOT present at the start of the output."""
        r = client.get(f"/projects/{seeded_project}/export?encoding=utf-16-le")
        assert r.status_code == 200
        assert not r.content.startswith(b"\xff\xfe")
        assert not r.content.startswith(b"\xfe\xff")

    def test_export_invalid_encoding_returns_422(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export?encoding=utf-32")
        assert r.status_code == 422

    # --- Encoding incompatibility → 400 ---

    def test_export_ascii_on_unicode_data_returns_400(self, client, seeded_unicode_project):
        r = client.get(f"/projects/{seeded_unicode_project}/export?encoding=ascii")
        assert r.status_code == 400
        assert "ascii" in r.json()["detail"].lower()

    def test_export_latin1_on_cjk_data_returns_400(self, client, seeded_unicode_project):
        r = client.get(f"/projects/{seeded_unicode_project}/export?encoding=latin-1")
        assert r.status_code == 400

    # --- Content-Disposition header ---

    def test_export_content_disposition_contains_filename(self, client, seeded_project):
        r = client.get(f"/projects/{seeded_project}/export")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert ".csv" in cd

    def test_export_filename_with_double_quote_is_sanitized(self, client, sample_csv):
        """A project name containing " must not break or inject the header."""
        with open(sample_csv, "rb") as f:
            resp = client.post(
                "/projects/upload",
                files={"file": ("test.csv", f, "text/csv")},
                data={"projectName": 'Evil"Name', "projectDescription": "Test"},
            )
        project_id = resp.json()["project_id"]
        r = client.get(f"/projects/{project_id}/export")
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        # The literal quote should have been stripped from the header value
        assert '"Evil"Name' not in cd


# --- Delete Endpoint Tests ---


class TestDeleteEndpoint:
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
