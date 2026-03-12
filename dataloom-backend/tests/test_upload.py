"""Tests for dataset upload functionality."""

from io import BytesIO

import pytest
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
        validate_upload_file(file)

    def test_xlsx_accepted(self):
        file = MockUploadFile("data.xlsx")
        validate_upload_file(file)

    def test_json_accepted(self):
        file = MockUploadFile("data.json")
        validate_upload_file(file)

    def test_parquet_accepted(self):
        file = MockUploadFile("data.parquet")
        validate_upload_file(file)

    def test_tsv_accepted(self):
        file = MockUploadFile("data.tsv")
        validate_upload_file(file)

    def test_exe_rejected(self):
        file = MockUploadFile("malware.exe")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_no_extension_rejected(self):
        file = MockUploadFile("noextension")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)

    def test_pdf_rejected(self):
        file = MockUploadFile("report.pdf")
        with pytest.raises(HTTPException, match="not allowed"):
            validate_upload_file(file)
