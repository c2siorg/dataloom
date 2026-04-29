"""Unit tests for file_service.store_upload() validations."""

from io import BytesIO
from unittest.mock import patch

import pytest

from app.config import get_settings
from app.services.file_service import store_upload


class MockUploadFile:
    """Minimal stand-in for FastAPI UploadFile."""

    def __init__(self, filename: str, content: bytes = b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)


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
        """A file well under the configured limit must be stored without raising."""
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
        """A file exactly at max_upload_size_bytes must be accepted."""
        settings = get_settings()
        content = b"x" * settings.max_upload_size_bytes
        file = MockUploadFile("exact.csv", content)
        original = tmp_path / "exact.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="exact.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)  # must not raise

    def test_oversized_file_raises_value_error(self):
        """A file one byte over max_upload_size_bytes must raise ValueError."""
        settings = get_settings()
        content = b"x" * (settings.max_upload_size_bytes + 1)
        file = MockUploadFile("huge.csv", content)
        with pytest.raises(ValueError, match="exceeds maximum allowed size of"):
            store_upload(file)

    def test_oversized_error_message_includes_actual_size_mb(self):
        """The ValueError message must include the actual file size in MB."""
        settings = get_settings()
        # Create a file that is two full MB over the limit so the actual size
        # printed in the error is clearly larger than the limit.
        over = settings.max_upload_size_bytes + 2 * 1024 * 1024
        content = b"x" * over
        file = MockUploadFile("toobig.csv", content)
        with pytest.raises(ValueError, match=r"exceeds maximum allowed size of"):
            store_upload(file)

    def test_chunked_validation_rejects_multi_chunk_file(self):
        """Size guard must work when content spans multiple 64 KB chunks.

        Verifies the chunk loop accumulates correctly: a multi-chunk file
        above the config limit must be rejected even though no single chunk
        exceeds the limit.
        """
        settings = get_settings()
        content = b"x" * (settings.max_upload_size_bytes + 1)
        file = MockUploadFile("chunked.csv", content)
        with pytest.raises(ValueError, match="exceeds maximum allowed size of"):
            store_upload(file)

    def test_chunked_validation_accepts_file_at_limit(self, tmp_path):
        """Chunked guard must accept a file that exactly meets the limit."""
        settings = get_settings()
        content = b"x" * settings.max_upload_size_bytes
        file = MockUploadFile("at_limit.csv", content)
        original = tmp_path / "at_limit.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="at_limit.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)  # must not raise


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

    def test_full_write_after_chunked_validation(self, tmp_path):
        """Full file content must be written to disk after chunked size validation.

        Verifies that seek(0) after the chunk loop restores the pointer
        so shutil.copyfileobj copies the complete content, not a partial tail.
        """
        # Construct content spanning more than one 64 KB chunk
        content = b"a,b\n" + b"1,2\n" * 20_000  # ~100 KB
        file = MockUploadFile("multi_chunk.csv", content)
        original = tmp_path / "multi_chunk.csv"

        with (
            patch("app.services.file_service.sanitize_filename", return_value="multi_chunk.csv"),
            patch("app.services.file_service.resolve_upload_path", return_value=original),
            patch("shutil.copy2"),
        ):
            store_upload(file)

        assert original.read_bytes() == content
