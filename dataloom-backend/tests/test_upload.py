"""Tests for dataset upload functionality."""

import asyncio
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


class TestValidateUploadFile:
    def test_csv_accepted(self):
        file = MockUploadFile("data.csv")
        asyncio.run(validate_upload_file(file))

    def test_non_csv_rejected(self):
        file = MockUploadFile("data.xlsx")
        with pytest.raises(HTTPException, match="not allowed"):
            asyncio.run(validate_upload_file(file))

    def test_exe_rejected(self):
        file = MockUploadFile("malware.exe")
        with pytest.raises(HTTPException, match="not allowed"):
            asyncio.run(validate_upload_file(file))

    def test_no_extension_rejected(self):
        file = MockUploadFile("noextension")
        with pytest.raises(HTTPException, match="not allowed"):
            asyncio.run(validate_upload_file(file))

    def test_file_under_size_limit(self):
        content = b"col1,col2\n" + b"1,2\n" * 100
        file = MockUploadFile("small.csv", content)
        asyncio.run(validate_upload_file(file))

    def test_file_at_size_limit(self):
        settings = get_settings()
        content = b"a" * settings.max_upload_size_bytes
        file = MockUploadFile("exact_limit.csv", content)
        asyncio.run(validate_upload_file(file))

    def test_file_over_size_limit(self):
        settings = get_settings()
        content = b"a" * (settings.max_upload_size_bytes + 1)
        file = MockUploadFile("oversized.csv", content)
        with pytest.raises(HTTPException, match="File size exceeds"):
            asyncio.run(validate_upload_file(file))
