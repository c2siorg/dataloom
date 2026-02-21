"""Tests for dataset upload functionality."""

import pytest
from io import BytesIO
from fastapi import HTTPException
from app.utils.security import validate_upload_file


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
