"""Tests for dataset upload functionality."""

from io import BytesIO

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.utils.security import validate_upload_file


class MockUploadFile:
    """Mock for FastAPI UploadFile."""

    def __init__(self, filename, content=b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)
        self.size = len(content)

    async def seek(self, position, whence=0):
        return self.file.seek(position, whence)

    async def read(self, size: int = -1) -> bytes:
        return self.file.read(size)


class MockUploadFileNoSize:
    """Mock for FastAPI UploadFile where Content-Length is absent (size=None).

    Forces validate_upload_file() to exercise the async chunk-reading branch
    rather than the fast-path that trusts file.size.
    """

    def __init__(self, filename, content=b"col1,col2\n1,2\n"):
        self.filename = filename
        self.file = BytesIO(content)
        self.size = None  # simulates missing Content-Length

    async def seek(self, position, whence=0):
        return self.file.seek(position, whence)

    async def read(self, size: int = -1) -> bytes:
        return self.file.read(size)


class TestValidateUploadFile:
    @pytest.mark.asyncio
    async def test_csv_accepted(self):
        file = MockUploadFile("data.csv")
        await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_non_csv_rejected(self):
        file = MockUploadFile("data.xlsx")
        with pytest.raises(HTTPException, match="not allowed"):
            await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_exe_rejected(self):
        file = MockUploadFile("malware.exe")
        with pytest.raises(HTTPException, match="not allowed"):
            await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_no_extension_rejected(self):
        file = MockUploadFile("noextension")
        with pytest.raises(HTTPException, match="not allowed"):
            await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_file_under_size_limit(self):
        content = b"col1,col2\n" + b"1,2\n" * 100
        file = MockUploadFile("small.csv", content)
        await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_file_at_size_limit(self):
        settings = get_settings()
        content = b"a" * settings.max_upload_size_bytes
        file = MockUploadFile("exact_limit.csv", content)
        await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_file_over_size_limit(self):
        settings = get_settings()
        content = b"a" * (settings.max_upload_size_bytes + 1)
        file = MockUploadFile("oversized.csv", content)
        with pytest.raises(HTTPException, match="File size exceeds"):
            await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_chunked_path_over_size_limit(self):
        """When file.size is None the chunk loop must reject an oversized file."""
        settings = get_settings()
        content = b"a" * (settings.max_upload_size_bytes + 1)
        file = MockUploadFileNoSize("oversized_no_size.csv", content)
        with pytest.raises(HTTPException, match="File size exceeds"):
            await validate_upload_file(file)

    @pytest.mark.asyncio
    async def test_chunked_path_exact_limit_accepted(self):
        """When file.size is None a file at exactly the limit must be accepted."""
        settings = get_settings()
        content = b"a" * settings.max_upload_size_bytes
        file = MockUploadFileNoSize("exact_no_size.csv", content)
        await validate_upload_file(file)  # must not raise
