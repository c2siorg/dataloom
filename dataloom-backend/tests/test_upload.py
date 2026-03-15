"""Tests for dataset upload functionality."""

from io import BytesIO
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.utils.security import _format_size, validate_upload_file


class MockUploadFile:
    """Mock for FastAPI UploadFile."""

    def __init__(self, filename, content=b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)


class TestValidateUploadFile:
    def test_csv_accepted(self):
        file = MockUploadFile("data.csv")
        # Should not raise
        validate_upload_file(file)

    def test_non_csv_rejected(self):
        file = MockUploadFile("data.xlsx")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_exe_rejected(self):
        file = MockUploadFile("malware.exe")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_no_extension_rejected(self):
        file = MockUploadFile("noextension")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_file_at_exact_max_size_accepted(self):
        """A file exactly at the size limit should be accepted."""
        max_size = 10_485_760  # 10 MB
        content = b"x" * max_size
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [".csv"]
            mock_settings.return_value.max_upload_size_bytes = max_size
            # Should not raise
            validate_upload_file(file)

    def test_file_exceeding_max_size_rejected(self):
        """A file exceeding the size limit should raise HTTP 413."""
        max_size = 1024  # 1 KB limit for testing
        content = b"x" * (max_size + 1)
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [".csv"]
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
        """The error message should include both the actual and maximum sizes."""
        max_size = 5_242_880  # 5 MB
        content = b"x" * (max_size + 1_048_576)  # ~6 MB
        file = MockUploadFile("data.csv", content=content)
        with patch("app.utils.security.get_settings") as mock_settings:
            mock_settings.return_value.allowed_extensions = [".csv"]
            mock_settings.return_value.max_upload_size_bytes = max_size
            with pytest.raises(HTTPException) as exc_info:
                validate_upload_file(file)
            assert "5.0 MB" in exc_info.value.detail


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


def test_upload_tsv_file(client, tmp_path):
    """TSV file should be parsed correctly using tab separator."""
    tsv_content = "name\tage\tcity\nAlice\t30\tNYC\nBob\t25\tLA"
    tsv_file = tmp_path / "test.tsv"
    tsv_file.write_text(tsv_content)
    with open(tsv_file, "rb") as f:
        response = client.post(
            "/projects/upload",
            data={"projectName": "TSV Test", "projectDescription": "test"},
            files={"file": ("test.tsv", f, "text/tab-separated-values")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["columns"] == ["name", "age", "city"]
    assert data["row_count"] == 2


def test_upload_parquet_file(client, tmp_path):
    """Parquet file should be parsed correctly using pyarrow."""
    import pandas as pd

    df = pd.DataFrame({"name": ["Alice", "Bob"], "age": [30, 25]})
    parquet_file = tmp_path / "test.parquet"
    df.to_parquet(parquet_file, index=False)
    with open(parquet_file, "rb") as f:
        response = client.post(
            "/projects/upload",
            data={"projectName": "Parquet Test", "projectDescription": "test"},
            files={"file": ("test.parquet", f, "application/octet-stream")},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["columns"] == ["name", "age"]
    assert data["row_count"] == 2


def test_upload_unsupported_format_rejected(client, tmp_path):
    """Unsupported formats should return 400."""
    bad_file = tmp_path / "test.xml"
    bad_file.write_text("<data></data>")
    with open(bad_file, "rb") as f:
        response = client.post(
            "/projects/upload",
            data={"projectName": "Bad", "projectDescription": "test"},
            files={"file": ("test.xml", f, "application/xml")},
        )
    assert response.status_code == 400
