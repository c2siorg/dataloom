"""Unit tests for file_service.store_upload() validations."""

from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.file_service import MAX_FILE_SIZE, store_upload


class MockUploadFile:
    """Minimal stand-in for FastAPI UploadFile."""

    def __init__(self, filename: str, content: bytes = b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_paths(tmp_path: Path):
    """Return patch targets that redirect disk writes to tmp_path."""
    original = tmp_path / "test.csv"
    copy = tmp_path / "test_copy.csv"
    return original, copy


# ---------------------------------------------------------------------------
# TestStoreUploadExtension
# ---------------------------------------------------------------------------


class TestStoreUploadExtension:
    def test_csv_file_is_accepted(self, tmp_path):
        """A .csv file should pass extension validation and be stored."""
        file = MockUploadFile("data.csv", b"name,age\nAlice,30\n")
        original = tmp_path / "data.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="data.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            result_original, result_copy = store_upload(file)

        assert result_original == original
        # copy path is derived from original by inserting _copy
        assert str(result_copy).endswith("_copy.csv")

    def test_uppercase_csv_extension_is_accepted(self, tmp_path):
        """Extension check must be case-insensitive (.CSV → accepted)."""
        file = MockUploadFile("DATA.CSV", b"a,b\n1,2\n")
        original = tmp_path / "DATA.CSV"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="DATA.CSV"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            # Should not raise
            store_upload(file)

    def test_non_csv_raises_value_error(self):
        """A non-.csv file must raise ValueError before touching the disk."""
        file = MockUploadFile("report.xlsx")
        with pytest.raises(ValueError, match="Only CSV files are supported. Got: .xlsx"):
            store_upload(file)

    def test_exe_file_raises_value_error(self):
        """An .exe file must raise ValueError."""
        file = MockUploadFile("malware.exe")
        with pytest.raises(ValueError, match="Only CSV files are supported. Got: .exe"):
            store_upload(file)

    def test_no_extension_raises_value_error(self):
        """A filename with no extension must raise ValueError."""
        file = MockUploadFile("nodotfile")
        # Path("nodotfile").suffix == "" → treated as non-.csv
        with pytest.raises(ValueError, match="Only CSV files are supported. Got:"):
            store_upload(file)

    def test_error_message_includes_actual_extension(self):
        """The ValueError message must embed the offending extension."""
        file = MockUploadFile("archive.zip")
        with pytest.raises(ValueError, match=r"\.zip"):
            store_upload(file)


# ---------------------------------------------------------------------------
# TestStoreUploadSize
# ---------------------------------------------------------------------------


class TestStoreUploadSize:
    def test_file_within_size_limit_is_accepted(self, tmp_path):
        """A file well under 50 MB must be stored without raising."""
        content = b"x" * 1024  # 1 KB
        file = MockUploadFile("small.csv", content)
        original = tmp_path / "small.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="small.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)  # must not raise

    def test_file_at_exact_size_limit_is_accepted(self, tmp_path):
        """A file exactly at MAX_FILE_SIZE must be accepted."""
        content = b"x" * MAX_FILE_SIZE
        file = MockUploadFile("exact.csv", content)
        original = tmp_path / "exact.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="exact.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)  # must not raise

    def test_oversized_file_raises_value_error(self):
        """A file one byte over MAX_FILE_SIZE must raise ValueError."""
        content = b"x" * (MAX_FILE_SIZE + 1)
        file = MockUploadFile("huge.csv", content)
        with pytest.raises(ValueError, match="exceeds maximum allowed size of 50MB"):
            store_upload(file)

    def test_oversized_error_message_includes_actual_size_mb(self):
        """The ValueError message must include the actual file size in MB."""
        # 51 MB file
        content = b"x" * (51 * 1024 * 1024)
        file = MockUploadFile("toobig.csv", content)
        with pytest.raises(ValueError, match=r"51\.0MB"):
            store_upload(file)


# ---------------------------------------------------------------------------
# TestStoreUploadPointerReset
# ---------------------------------------------------------------------------


class TestStoreUploadPointerReset:
    def test_file_pointer_is_reset_before_write(self, tmp_path):
        """After the size check the file pointer must be at position 0
        so shutil.copyfileobj writes the complete file content."""
        content = b"col1,col2\n1,2\n3,4\n"
        file = MockUploadFile("data.csv", content)
        original = tmp_path / "data.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="data.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)

        # The file on disk should contain the full original content
        assert original.read_bytes() == content
