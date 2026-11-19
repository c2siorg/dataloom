"""Tests for the text casing and pattern cleaning transformation (textTransform).

Verifies lower, upper, title, capitalize, and alphanumeric filtering,
along with missing value preservation, column collision prevention,
pipeline replay, and full transactional HTTP lifecycle.
"""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.schemas import (
    OperationType,
    TextTransformCase,
    TextTransformParams,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    operation_summary,
    text_transform,
)


@pytest.fixture
def sample_text_df() -> pd.DataFrame:
    """Fixture providing diverse text samples for pattern and casing transformation testing."""
    return pd.DataFrame(
        {
            "id": [1, 2, 3, 4],
            "raw_text": ["hello WORLD!", "Data-Loom 2026", "mIxEd_CaSe text", "already clean"],
        }
    )


class TestTextTransformModes:
    """Test suite for casing algorithms and character pattern filtering."""

    def test_lowercase_transformation(self, sample_text_df: pd.DataFrame):
        """Verify lower mode converts all characters to lowercase in-place."""
        result = text_transform(sample_text_df, column="raw_text", mode="lower")
        assert result["raw_text"].iloc[0] == "hello world!"
        assert result["raw_text"].iloc[2] == "mixed_case text"

    def test_uppercase_transformation(self, sample_text_df: pd.DataFrame):
        """Verify upper mode converts all characters to uppercase in-place."""
        result = text_transform(sample_text_df, column="raw_text", mode="upper")
        assert result["raw_text"].iloc[0] == "HELLO WORLD!"
        assert result["raw_text"].iloc[3] == "ALREADY CLEAN"

    def test_title_and_capitalize_transformations(self, sample_text_df: pd.DataFrame):
        """Verify title capitalizes each word while capitalize capitalizes the first character."""
        title_res = text_transform(sample_text_df, column="raw_text", mode="title")
        assert title_res["raw_text"].iloc[0] == "Hello World!"

        cap_res = text_transform(sample_text_df, column="raw_text", mode="capitalize")
        assert cap_res["raw_text"].iloc[0] == "Hello world!"

    def test_alphanumeric_only_filter(self):
        """Verify alphanumeric_only strips punctuation and symbols while retaining spaces."""
        df = pd.DataFrame({"text": ["Hello, World! #2026", "user@domain.com", "$100.50 [test]"]})
        result = text_transform(df, column="text", mode="alphanumeric_only")
        assert result["text"].iloc[0] == "Hello World 2026"
        assert result["text"].iloc[1] == "userdomaincom"
        assert result["text"].iloc[2] == "10050 test"

    def test_output_column_preserves_original(self, sample_text_df: pd.DataFrame):
        """Verify specifying output_column preserves original text column intact."""
        result = text_transform(sample_text_df, column="raw_text", mode="upper", output_column="text_upper")
        assert "text_upper" in result.columns
        assert result["raw_text"].iloc[0] == "hello WORLD!"
        assert result["text_upper"].iloc[0] == "HELLO WORLD!"

    def test_preserves_missing_values(self):
        """Verify NaN / None values remain missing without raising TypeError."""
        df = pd.DataFrame({"text": ["hello", None, float("nan"), "world"]})
        result = text_transform(df, column="text", mode="upper")
        assert result["text"].iloc[0] == "HELLO"
        assert pd.isna(result["text"].iloc[1])
        assert pd.isna(result["text"].iloc[2])
        assert result["text"].iloc[3] == "WORLD"


class TestGuardrailsAndEdgeCases:
    """Test suite for boundary safety, missing inputs, and collision guards."""

    def test_missing_column_raises_error(self, sample_text_df: pd.DataFrame):
        """Verify referencing non-existent column raises TransformationError."""
        with pytest.raises(TransformationError, match="Column 'non_existent' not found"):
            text_transform(sample_text_df, column="non_existent", mode="lower")

    def test_unknown_mode_raises_error(self, sample_text_df: pd.DataFrame):
        """Verify invalid transform mode raises TransformationError with supported modes list."""
        with pytest.raises(TransformationError, match="Unknown text transform mode"):
            text_transform(sample_text_df, column="raw_text", mode="invalid_mode")

    def test_output_column_collision_rejected(self, sample_text_df: pd.DataFrame):
        """Verify output_column colliding with existing column raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            text_transform(sample_text_df, column="raw_text", output_column="id")

    def test_output_column_same_as_input_column_allowed(self, sample_text_df: pd.DataFrame):
        """Verify explicit in-place replacement using input column name succeeds."""
        result = text_transform(sample_text_df, column="raw_text", mode="lower", output_column="raw_text")
        assert result["raw_text"].iloc[0] == "hello world!"

    def test_non_text_columns_rejected(self):
        """Verify numeric and boolean columns raise TransformationError."""
        df = pd.DataFrame({"num": [1, 2, 3], "flag": [True, False, True]})
        with pytest.raises(TransformationError, match="not a text column"):
            text_transform(df, column="num", mode="lower")
        with pytest.raises(TransformationError, match="not a text column"):
            text_transform(df, column="flag", mode="upper")

    def test_empty_dataframe_schema_deterministic(self):
        """Verify empty DataFrame returns deterministic schema with target column added."""
        df = pd.DataFrame({"text": pd.Series([], dtype=str)})
        result = text_transform(df, column="text", mode="upper", output_column="text_upper")
        assert "text_upper" in result.columns
        assert len(result) == 0

    def test_whitespace_output_column_rejected(self, sample_text_df: pd.DataFrame):
        """Verify blank or whitespace output_column is rejected."""
        with pytest.raises(TransformationError, match="output_column must not be empty"):
            text_transform(sample_text_df, column="raw_text", output_column="   ")

    def test_datetime_column_rejected(self):
        """Verify datetime columns are rejected."""
        df = pd.DataFrame({"dt": pd.to_datetime(["2026-01-01", "2026-02-01"])})
        with pytest.raises(TransformationError, match="not a text column"):
            text_transform(df, column="dt", mode="lower")

    def test_alphanumeric_only_strips_underscore(self):
        """Verify alphanumeric_only strips underscores as non-alphanumeric characters."""
        df = pd.DataFrame({"text": ["user_name_123!#", "hello_world"]})
        result = text_transform(df, column="text", mode="alphanumeric_only")
        assert result["text"].tolist() == ["username123", "helloworld"]

    def test_output_column_whitespace_collision_rejected(self):
        """Verify output_column collision check normalizes whitespace."""
        df = pd.DataFrame({"txt": ["a", "b"], "target ": ["c", "d"]})
        with pytest.raises(TransformationError, match="already exists"):
            text_transform(df, column="txt", output_column="target")

    def test_pydantic_schema_validation(self):
        """Verify Pydantic schema parses and validates parameters."""
        params = TextTransformParams(column="raw_text", mode=TextTransformCase.upper, output_column="out")
        assert params.column == "raw_text"
        assert params.mode == TextTransformCase.upper


class TestPipelineAndHttpLifecycle:
    """Test suite for pipeline registry integration and HTTP lifecycle."""

    def test_transformation_registry_spec(self):
        """Verify textTransform registry spec is configured as reusable."""
        spec = TRANSFORMATION_REGISTRY.get(OperationType.textTransform)
        assert spec is not None
        assert spec.func == "text_transform"
        assert spec.reusable is True

        payload = {"text_transform_params": {"column": "name", "mode": "upper", "output_column": "NAME"}}
        args = spec.build_args(payload)
        assert args == ("name", "upper", "NAME")

    def test_pipeline_replay_apply_logged_transformation(self, sample_text_df: pd.DataFrame):
        """Verify apply_logged_transformation re-applies text transformation cleanly."""
        details = {"text_transform_params": {"column": "raw_text", "mode": "upper"}}
        result = apply_logged_transformation(sample_text_df, OperationType.textTransform, details)
        assert result["raw_text"].iloc[0] == "HELLO WORLD!"

    def test_operation_summary_formatting(self):
        """Verify operation_summary outputs clean human-readable parameter summary."""
        details = {"text_transform_params": {"column": "city", "mode": "title"}}
        summary = operation_summary(OperationType.textTransform, details)
        assert "column: city" in summary
        assert "mode: title" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Verify full HTTP lifecycle: preview mode, commit persistence, undo, and redo."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_content = "id,name\n1,alice smith\n2,BOB JONES\n"
        files = {"file": ("people.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {"projectName": "Text Project", "projectDescription": "Casing test"}
        upload_resp = client.post("/projects/upload", files=files, data=data)
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        transform_payload = {
            "operation_type": "textTransform",
            "text_transform_params": {
                "column": "name",
                "mode": "title",
            },
        }

        # Step 1: Preview mode (uncommitted)
        preview_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": "true"},
            json=transform_payload,
        )
        assert preview_resp.status_code == 200
        name_idx = preview_resp.json()["columns"].index("name")
        assert preview_resp.json()["rows"][0][name_idx] == "Alice Smith"
        assert preview_resp.json()["rows"][1][name_idx] == "Bob Jones"

        # Step 2: Verify project remains uncommitted
        get_uncommitted = client.get(f"/projects/get/{project_id}")
        assert get_uncommitted.json()["rows"][0][name_idx] == "alice smith"

        # Step 3: Commit transformation
        commit_resp = client.post(f"/projects/{project_id}/transform", json=transform_payload)
        assert commit_resp.status_code == 200
        get_committed = client.get(f"/projects/get/{project_id}")
        assert get_committed.json()["rows"][0][name_idx] == "Alice Smith"

        # Step 4: Undo transformation
        undo_resp = client.post(f"/projects/{project_id}/undo")
        assert undo_resp.status_code == 200
        get_undone = client.get(f"/projects/get/{project_id}")
        assert get_undone.json()["rows"][0][name_idx] == "alice smith"

        # Step 5: Redo transformation
        redo_resp = client.post(f"/projects/{project_id}/redo")
        assert redo_resp.status_code == 200
        get_redone = client.get(f"/projects/get/{project_id}")
        assert get_redone.json()["rows"][0][name_idx] == "Alice Smith"
