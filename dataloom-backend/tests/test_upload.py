"""Tests for dataset upload functionality."""

from io import BytesIO
from unittest.mock import patch

import pandas as pd
import pytest
from fastapi import HTTPException

from app.utils.security import _format_size, validate_upload_file


class MockUploadFile:
    """Mock for FastAPI UploadFile."""

    def __init__(self, filename, content=b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)


# ── helpers ──────────────────────────────────────────────────────────────────

def _make_xlsx_bytes() -> bytes:
    """Create a minimal valid xlsx file in memory."""
    buf = BytesIO()
    pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]}).to_excel(buf, index=False)
    buf.seek(0)
    return buf.read()


def _make_parquet_bytes() -> bytes:
    """Create a minimal valid parquet file in memory."""
    buf = BytesIO()
    pd.DataFrame({"col1": [1, 2], "col2": ["a", "b"]}).to_parquet(buf, index=False)
    buf.seek(0)
    return buf.read()


# ── extension validation ──────────────────────────────────────────────────────

class TestValidateUploadFile:
    def test_csv_accepted(self):
        file = MockUploadFile("data.csv")
        validate_upload_file(file)  # should not raise

    def test_xlsx_accepted(self):
        """Excel files should now be accepted."""
        file = MockUploadFile("data.xlsx", content=_make_xlsx_bytes())
        validate_upload_file(file)  # should not raise

    def test_xls_accepted(self):
        """Legacy Excel files should be accepted."""
        file = MockUploadFile("data.xls")
        validate_upload_file(file)  # should not raise

    def test_json_accepted(self):
        """JSON files should be accepted."""
        content = b'[{"col1": 1, "col2": "a"}]'
        file = MockUploadFile("data.json", content=content)
        validate_upload_file(file)  # should not raise

    def test_tsv_accepted(self):
        """Tab-separated files should be accepted."""
        content = b"col1\tcol2\n1\ta\n2\tb\n"
        file = MockUploadFile("data.tsv", content=content)
        validate_upload_file(file)  # should not raise

    def test_parquet_accepted(self):
        """Parquet files should be accepted."""
        file = MockUploadFile("data.parquet", content=_make_parquet_bytes())
        validate_upload_file(file)  # should not raise

    def test_exe_rejected(self):
        file = MockUploadFile("malware.exe")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_py_rejected(self):
        """Python files must be rejected to prevent code execution."""
        file = MockUploadFile("script.py")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_no_extension_rejected(self):
        file = MockUploadFile("noextension")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_case_insensitive_extension(self):
        """Extensions should be matched case-insensitively."""
        file = MockUploadFile("DATA.CSV")
        validate_upload_file(file)  # should not raise

    def test_uppercase_xlsx_accepted(self):
        file = MockUploadFile("REPORT.XLSX", content=_make_xlsx_bytes())
        validate_upload_file(file)  # should not raise

    # ── size validation ───────────────────────────────────────────────────────

    def test_file_at_exact_max_size_accepted(self):
        """A file exactly at the size limit should be accepted."""
        max_size = 10_485_760  # 10 MB
        content = b"x" * max_size
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [
                ".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"
            ]
            mock_settings.return_value.max_upload_size_bytes = max_size
            validate_upload_file(file)  # should not raise

    def test_file_exceeding_max_size_rejected(self):
        """A file exceeding the size limit should raise HTTP 413."""
        max_size = 1024  # 1 KB limit for testing
        content = b"x" * (max_size + 1)
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [
                ".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"
            ]
            mock_settings.return_value.max_upload_size_bytes = max_size
            with pytest.raises(HTTPException) as exc_info:
                validate_upload_file(file)
            assert exc_info.value.status_code == 413
            assert "File too large" in exc_info.value.detail
            assert "1.0 KB" in exc_info.value.detail

    def test_empty_file_accepted(self):
        """An empty file should pass size validation (extension still checked)."""
        file = MockUploadFile("data.csv", content=b"")
        validate_upload_file(file)

    def test_file_cursor_reset_after_validation(self):
        """After validation the file cursor should be at position 0."""
        content = b"col1,col2\n1,2\n"
        file = MockUploadFile("data.csv", content=content)
        validate_upload_file(file)
        assert file.file.read() == content

    def test_oversized_error_message_includes_sizes(self):
        """The error message should include both actual and maximum sizes."""
        max_size = 5_242_880  # 5 MB
        content = b"x" * (max_size + 1_048_576)  # ~6 MB
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [
                ".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"
            ]
            mock_settings.return_value.max_upload_size_bytes = max_size
            with pytest.raises(HTTPException) as exc_info:
                validate_upload_file(file)
            assert "5.0 MB" in exc_info.value.detail


# ── profiling endpoint ────────────────────────────────────────────────────────

class TestProfilingEndpoint:
    """Integration-style tests for GET /projects/{id}/profile."""

    def test_profile_returns_expected_keys(self, client, uploaded_csv_project):
        """Profile response must include all top-level keys."""
        pid = uploaded_csv_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        assert resp.status_code == 200
        data = resp.json()
        for key in ("project_id", "total_rows", "total_columns",
                    "duplicate_rows", "quality_score", "columns"):
            assert key in data, f"Missing key: {key}"

    def test_quality_score_range(self, client, uploaded_csv_project):
        """Quality score must be between 0 and 100."""
        pid = uploaded_csv_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        score = resp.json()["quality_score"]
        assert 0.0 <= score <= 100.0

    def test_perfect_quality_score_clean_data(self, client, uploaded_csv_project):
        """A clean dataset with no nulls or duplicates should score 100."""
        pid = uploaded_csv_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        assert resp.json()["quality_score"] == 100.0

    def test_column_profile_has_dtype(self, client, uploaded_csv_project):
        """Every column profile must include a dtype field."""
        pid = uploaded_csv_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        for col in resp.json()["columns"]:
            assert "dtype" in col
            assert "null_count" in col
            assert "unique_count" in col

    def test_numeric_column_has_stats(self, client, uploaded_numeric_project):
        """Numeric columns must include mean, std, min, max, and quartiles."""
        pid = uploaded_numeric_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        numeric_cols = [
            c for c in resp.json()["columns"]
            if c["dtype"] in ("int", "float")
        ]
        assert len(numeric_cols) > 0, "Expected at least one numeric column"
        for col in numeric_cols:
            for stat in ("mean", "std", "min", "p25", "p50", "p75", "max"):
                assert stat in col, f"Missing stat '{stat}' in column {col['name']}"

    def test_profile_nonexistent_project_returns_404(self, client):
        """Profile of a nonexistent project must return 404."""
        import uuid
        fake_id = uuid.uuid4()
        resp = client.get(f"/projects/{fake_id}/profile")
        assert resp.status_code == 404

    def test_duplicate_rows_counted_correctly(self, client, uploaded_duplicate_project):
        """Duplicate rows should be reflected in the profile."""
        pid = uploaded_duplicate_project["project_id"]
        resp = client.get(f"/projects/{pid}/profile")
        assert resp.json()["duplicate_rows"] > 0
        assert resp.json()["quality_score"] < 100.0


# ── format size helper ────────────────────────────────────────────────────────

class TestFormatSize:
    def test_bytes(self):
        assert _format_size(500) == "500.0 B"

    def test_kilobytes(self):
        assert _format_size(1024) == "1.0 KB"

    def test_megabytes(self):
        assert _format_size(10_485_760) == "10.0 MB"

    def test_gigabytes(self):
        assert _format_size(1_073_741_824) == "1.0 GB"

    def test_zero(self):
        assert _format_size(0) == "0.0 B"