"""End-to-end tests for multi-format upload, lifecycle, and export.

These drive the real API with TestClient (upload -> store -> read -> DB ->
response), proving the whole pipeline works for each supported format, not just
the format registry in isolation.
"""

from io import BytesIO
from pathlib import Path

import pandas as pd
import pytest
from fastapi import HTTPException

SAMPLE = pd.DataFrame(
    {
        "name": ["Alice", "Bob", "Charlie"],
        "age": [30, 25, 35],
        "city": ["New York", "Los Angeles", "Chicago"],
    }
)


def _encode(df: pd.DataFrame, ext: str) -> bytes:
    """Serialize a DataFrame to the on-disk bytes for the given format."""
    if ext == ".csv":
        return df.to_csv(index=False).encode()
    if ext == ".tsv":
        return df.to_csv(sep="\t", index=False).encode()
    if ext == ".json":
        return df.to_json(orient="records").encode()
    if ext == ".xlsx":
        buf = BytesIO()
        df.to_excel(buf, index=False)
        return buf.getvalue()
    if ext == ".parquet":
        buf = BytesIO()
        df.to_parquet(buf, index=False)
        return buf.getvalue()
    raise ValueError(ext)


def _upload(client, content: bytes, filename: str):
    return client.post(
        "/projects/upload",
        files={"file": (filename, content, "application/octet-stream")},
        data={"projectName": "Multiformat", "projectDescription": "format test"},
    )


# --- Happy path: every format uploads and parses correctly ----------------


class TestUploadEachFormat:
    @pytest.mark.parametrize("ext", [".csv", ".tsv", ".json", ".xlsx", ".parquet"])
    def test_upload_returns_correct_shape(self, client, ext):
        response = _upload(client, _encode(SAMPLE, ext), f"data{ext}")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["columns"] == ["name", "age", "city"]
        assert body["total_rows"] == 3
        assert body["rows"][0][0] == "Alice"


# --- Full lifecycle through the API for a non-CSV format ------------------


class TestXlsxLifecycle:
    """Upload -> transform -> revert on .xlsx exercises the native-extension
    working-copy logic (the riskiest part of the refactor) end to end."""

    def test_transform_then_revert(self, client):
        project_id = _upload(client, _encode(SAMPLE, ".xlsx"), "data.xlsx").json()["project_id"]

        filtered = client.post(
            f"/projects/{project_id}/transform",
            json={
                "operation_type": "filter",
                "parameters": {"column": "name", "condition": "=", "value": "Alice"},
            },
        )
        assert filtered.status_code == 200, filtered.text
        assert filtered.json()["row_count"] == 1

        reverted = client.post(f"/projects/{project_id}/revert")
        assert reverted.status_code == 200, reverted.text
        assert reverted.json()["total_rows"] == 3


# --- Export returns the native format -------------------------------------


class TestExportNativeFormat:
    def test_export_xlsx_round_trips(self, client):
        project_id = _upload(client, _encode(SAMPLE, ".xlsx"), "data.xlsx").json()["project_id"]

        response = client.get(f"/projects/{project_id}/export")

        assert response.status_code == 200
        assert "spreadsheetml" in response.headers["content-type"]
        assert response.headers["content-disposition"].endswith('.xlsx"')
        # The downloaded bytes must re-open as a valid spreadsheet.
        result = pd.read_excel(BytesIO(response.content))
        assert result["name"].tolist() == ["Alice", "Bob", "Charlie"]


def _decode(content: bytes, ext: str) -> pd.DataFrame:
    """Parse downloaded export bytes for the given target format."""
    if ext == "csv":
        return pd.read_csv(BytesIO(content))
    if ext == "tsv":
        return pd.read_csv(BytesIO(content), sep="\t")
    if ext == "json":
        return pd.read_json(BytesIO(content))
    if ext == "xlsx":
        return pd.read_excel(BytesIO(content))
    if ext == "parquet":
        return pd.read_parquet(BytesIO(content))
    raise ValueError(ext)


class TestExportConversionMatrix:
    """Any supported source format must be exportable to any target format."""

    @pytest.mark.parametrize("source_ext", [".csv", ".tsv", ".json", ".xlsx", ".parquet"])
    @pytest.mark.parametrize("target", ["csv", "tsv", "json", "xlsx", "parquet"])
    def test_convert(self, client, source_ext, target):
        project_id = _upload(client, _encode(SAMPLE, source_ext), f"data{source_ext}").json()["project_id"]

        response = client.get(f"/projects/{project_id}/export", params={"format": target})

        assert response.status_code == 200, response.text
        assert response.headers["content-disposition"].endswith(f'.{target}"')
        result = _decode(response.content, target)
        assert result["name"].tolist() == ["Alice", "Bob", "Charlie"]
        assert result["age"].tolist() == [30, 25, 35]

    def test_unsupported_target_format_is_400(self, client):
        project_id = _upload(client, _encode(SAMPLE, ".csv"), "data.csv").json()["project_id"]

        response = client.get(f"/projects/{project_id}/export", params={"format": "txt"})

        assert response.status_code == 400

    def test_failed_conversion_write_removes_temp_file(self, client, monkeypatch):
        from app.api.endpoints import projects as projects_endpoint

        project_id = _upload(client, _encode(SAMPLE, ".csv"), "data.csv").json()["project_id"]
        temp_paths = []
        original_named_temporary_file = projects_endpoint.tempfile.NamedTemporaryFile

        def tracking_named_temporary_file(*args, **kwargs):
            tmp = original_named_temporary_file(*args, **kwargs)
            temp_paths.append(Path(tmp.name))
            return tmp

        def boom(*args, **kwargs):
            raise HTTPException(status_code=500, detail="simulated write failure")

        monkeypatch.setattr(projects_endpoint.tempfile, "NamedTemporaryFile", tracking_named_temporary_file)
        monkeypatch.setattr(projects_endpoint, "save_table_safe", boom)

        response = client.get(f"/projects/{project_id}/export", params={"format": "json"})

        assert response.status_code == 500
        assert temp_paths
        assert all(not path.exists() for path in temp_paths)


# --- Broken / malformed inputs fail gracefully (no 500 crash) -------------


class TestBrokenInputs:
    def test_malformed_json_is_400(self, client):
        response = _upload(client, b"{not valid json", "broken.json")
        assert response.status_code == 400

    def test_deeply_nested_json_is_400(self, client):
        content = b'[{"name": "Alice", "address": {"geo": {"lat": 1}}}]'
        response = _upload(client, content, "nested.json")
        assert response.status_code == 400
        assert "nesting" in response.json()["detail"].lower()

    def test_corrupt_xlsx_is_400_not_500(self, client):
        # Random bytes with an .xlsx extension is not a real spreadsheet.
        response = _upload(client, b"this is not a real xlsx file", "corrupt.xlsx")
        assert response.status_code == 400
        assert response.json()["detail"]  # non-empty, client-facing message

    def test_corrupt_parquet_is_400_not_500(self, client):
        # Garbage bytes with a .parquet extension must fail gracefully, not 500.
        response = _upload(client, b"this is not a real parquet file", "corrupt.parquet")
        assert response.status_code == 400
        assert response.json()["detail"]  # non-empty, client-facing message

    def test_empty_file_is_400(self, client):
        response = _upload(client, b"", "empty.csv")
        assert response.status_code == 400

    def test_unsupported_extension_is_rejected(self, client):
        response = _upload(client, b"hello", "notes.txt")
        assert response.status_code == 400
