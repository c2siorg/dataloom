"""Tests for the numeric clamping and clipping transformation (clipNumeric).

Verifies lower-bound, upper-bound, two-sided clamping, missing value
preservation, non-numeric guards, pipeline replay, and transactional
HTTP preview, commit, undo, and redo lifecycles.
"""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.schemas import (
    ClipNumericParams,
    OperationType,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    clip_numeric,
    operation_summary,
)


@pytest.fixture
def sample_numeric_df() -> pd.DataFrame:
    """Fixture providing numeric data spanning wide ranges for clipping verification."""
    return pd.DataFrame(
        {
            "id": [1, 2, 3, 4, 5],
            "val": [-50.0, 0.0, 50.0, 100.0, 200.0],
            "note": ["A", "B", "C", "D", "E"],
        }
    )


class TestClipNumericFunctionality:
    """Test suite for boundary clamping mechanisms."""

    def test_clip_two_sided_range(self, sample_numeric_df: pd.DataFrame):
        """Verify clamping both lower and upper bounds bounds values within [lower, upper]."""
        result = clip_numeric(sample_numeric_df, column="val", lower=0.0, upper=100.0)
        assert result["val"].tolist() == [0.0, 0.0, 50.0, 100.0, 100.0]

    def test_clip_lower_bound_only(self, sample_numeric_df: pd.DataFrame):
        """Verify specifying only lower bound caps minimum without capping maximum."""
        result = clip_numeric(sample_numeric_df, column="val", lower=10.0)
        assert result["val"].tolist() == [10.0, 10.0, 50.0, 100.0, 200.0]

    def test_clip_upper_bound_only(self, sample_numeric_df: pd.DataFrame):
        """Verify specifying only upper bound caps maximum without capping minimum."""
        result = clip_numeric(sample_numeric_df, column="val", upper=75.0)
        assert result["val"].tolist() == [-50.0, 0.0, 50.0, 75.0, 75.0]

    def test_clip_with_output_column(self, sample_numeric_df: pd.DataFrame):
        """Verify specifying output_column preserves original numeric column intact."""
        result = clip_numeric(sample_numeric_df, column="val", lower=0.0, output_column="val_clipped")
        assert "val_clipped" in result.columns
        assert result["val"].iloc[0] == -50.0
        assert result["val_clipped"].iloc[0] == 0.0

    def test_clip_preserves_missing_values(self):
        """Verify NaN / null values remain missing and are not clamped to bounds."""
        df = pd.DataFrame({"val": [-10.0, float("nan"), None, 150.0]})
        result = clip_numeric(df, column="val", lower=0.0, upper=100.0)
        assert result["val"].iloc[0] == 0.0
        assert pd.isna(result["val"].iloc[1])
        assert pd.isna(result["val"].iloc[2])
        assert result["val"].iloc[3] == 100.0

    def test_clip_single_point_boundary(self, sample_numeric_df: pd.DataFrame):
        """Verify lower == upper clamps all non-null values to the single constant point."""
        result = clip_numeric(sample_numeric_df, column="val", lower=42.0, upper=42.0)
        assert result["val"].tolist() == [42.0, 42.0, 42.0, 42.0, 42.0]

    def test_output_column_same_as_input_column_allowed(self, sample_numeric_df: pd.DataFrame):
        """Verify explicit in-place replacement using input column name succeeds."""
        result = clip_numeric(sample_numeric_df, column="val", lower=0.0, upper=50.0, output_column="val")
        assert result["val"].tolist() == [0.0, 0.0, 50.0, 50.0, 50.0]

    def test_empty_dataframe_schema_deterministic(self):
        """Verify empty DataFrame returns deterministic schema with target column added."""
        df = pd.DataFrame({"val": pd.Series([], dtype=float)})
        result = clip_numeric(df, column="val", lower=0.0, upper=10.0, output_column="val_clipped")
        assert "val_clipped" in result.columns
        assert len(result) == 0

    def test_all_null_series_with_output_column(self):
        """Verify series of all NaNs creates output column with identical null structure."""
        df = pd.DataFrame({"val": [float("nan"), None]})
        result = clip_numeric(df, column="val", lower=0.0, upper=10.0, output_column="val_clipped")
        assert "val_clipped" in result.columns
        assert result["val_clipped"].isna().all()


class TestGuardrailsAndEdgeCases:
    """Test suite for safety constraints, input validation, and structural boundaries."""

    def test_missing_column_raises_error(self, sample_numeric_df: pd.DataFrame):
        """Verify non-existent column raises TransformationError."""
        with pytest.raises(TransformationError, match="Column 'non_existent' not found"):
            clip_numeric(sample_numeric_df, column="non_existent", lower=0.0)

    def test_boolean_column_rejected(self):
        """Verify boolean column is rejected because bool is not a continuous numeric candidate."""
        df = pd.DataFrame({"flag": [True, False, True]})
        with pytest.raises(TransformationError, match="is boolean"):
            clip_numeric(df, column="flag", lower=0.0)

    def test_non_numeric_string_column_rejected(self):
        """Verify non-numeric text column is rejected with informative error."""
        df = pd.DataFrame({"text": ["apple", "banana"]})
        with pytest.raises(TransformationError, match="is not numeric"):
            clip_numeric(df, column="text", lower=0.0)

    def test_no_boundaries_provided_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify specifying neither lower nor upper bound raises TransformationError."""
        with pytest.raises(TransformationError, match="At least one of 'lower' or 'upper'"):
            clip_numeric(sample_numeric_df, column="val")

    def test_inverted_boundaries_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify lower > upper raises TransformationError."""
        with pytest.raises(TransformationError, match="cannot be greater than upper"):
            clip_numeric(sample_numeric_df, column="val", lower=100.0, upper=0.0)

    def test_output_column_collision_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify output_column collision raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            clip_numeric(sample_numeric_df, column="val", lower=0.0, output_column="note")

    def test_integer_dtype_preserved_on_integer_bounds(self):
        """Verify integer series retains integer dtype when clipped with integer bounds."""
        df = pd.DataFrame({"count": pd.Series([1, 5, 10], dtype="int64")})
        res = clip_numeric(df, column="count", lower=2, upper=8)
        assert pd.api.types.is_integer_dtype(res["count"])
        assert res["count"].tolist() == [2, 5, 8]

    def test_output_column_whitespace_collision_rejected(self):
        """Verify output_column collision check normalizes whitespace."""
        df = pd.DataFrame({"val": [1, 2], "target ": [3, 4]})
        with pytest.raises(TransformationError, match="already exists"):
            clip_numeric(df, column="val", lower=0, output_column="target")

    def test_nan_bounds_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify float('nan') bounds are rejected in function and schema."""
        with pytest.raises(TransformationError, match="must not be NaN"):
            clip_numeric(sample_numeric_df, column="val", lower=float("nan"))
        with pytest.raises(TransformationError, match="must not be NaN"):
            clip_numeric(sample_numeric_df, column="val", upper=float("nan"))
        with pytest.raises(ValidationError, match="must not be NaN"):
            ClipNumericParams(column="val", lower=float("nan"))
        with pytest.raises(ValidationError, match="must not be NaN"):
            ClipNumericParams(column="val", upper=float("nan"))

    def test_pydantic_schema_validation(self):
        """Verify Pydantic schema validator enforces boundary consistency."""
        params = ClipNumericParams(column="val", lower=0.0, upper=10.0)
        assert params.lower == 0.0
        assert params.upper == 10.0

        with pytest.raises(ValueError, match="At least one of 'lower' or 'upper'"):
            ClipNumericParams(column="val")

        with pytest.raises(ValueError, match="cannot be greater than upper"):
            ClipNumericParams(column="val", lower=50.0, upper=10.0)


class TestPipelineAndHttpLifecycle:
    """Test suite for pipeline registry integration and HTTP lifecycle."""

    def test_transformation_registry_spec(self):
        """Verify clipNumeric registry spec is configured as reusable."""
        spec = TRANSFORMATION_REGISTRY.get(OperationType.clipNumeric)
        assert spec is not None
        assert spec.func == "clip_numeric"
        assert spec.reusable is True

        payload = {"clip_numeric_params": {"column": "val", "lower": 0.0, "upper": 100.0}}
        args = spec.build_args(payload)
        assert args == ("val", 0.0, 100.0, None)

    def test_pipeline_replay_apply_logged_transformation(self, sample_numeric_df: pd.DataFrame):
        """Verify apply_logged_transformation re-applies clipping cleanly."""
        details = {"clip_numeric_params": {"column": "val", "lower": 0.0, "upper": 50.0}}
        result = apply_logged_transformation(sample_numeric_df, OperationType.clipNumeric, details)
        assert result["val"].tolist() == [0.0, 0.0, 50.0, 50.0, 50.0]

    def test_operation_summary_formatting(self):
        """Verify operation_summary outputs clean human-readable parameter summary."""
        details = {"clip_numeric_params": {"column": "score", "lower": 10.0, "upper": 90.0}}
        summary = operation_summary(OperationType.clipNumeric, details)
        assert "column: score" in summary
        assert "lower: 10.0" in summary
        assert "upper: 90.0" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Verify full HTTP lifecycle: preview mode, commit persistence, undo, and redo."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_content = "id,score\n1,-20.0\n2,50.0\n3,120.0\n"
        files = {"file": ("scores.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {"projectName": "Clip Project", "projectDescription": "Clipping test"}
        upload_resp = client.post("/projects/upload", files=files, data=data)
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        transform_payload = {
            "operation_type": "clipNumeric",
            "clip_numeric_params": {
                "column": "score",
                "lower": 0.0,
                "upper": 100.0,
            },
        }

        # Step 1: Preview mode (uncommitted)
        preview_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": "true"},
            json=transform_payload,
        )
        assert preview_resp.status_code == 200
        score_idx = preview_resp.json()["columns"].index("score")
        assert preview_resp.json()["rows"][0][score_idx] == 0.0
        assert preview_resp.json()["rows"][1][score_idx] == 50.0
        assert preview_resp.json()["rows"][2][score_idx] == 100.0

        # Step 2: Verify project remains uncommitted
        get_uncommitted = client.get(f"/projects/get/{project_id}")
        assert get_uncommitted.json()["rows"][0][score_idx] == -20.0

        # Step 3: Commit transformation
        commit_resp = client.post(f"/projects/{project_id}/transform", json=transform_payload)
        assert commit_resp.status_code == 200
        get_committed = client.get(f"/projects/get/{project_id}")
        assert get_committed.json()["rows"][0][score_idx] == 0.0

        # Step 4: Undo transformation
        undo_resp = client.post(f"/projects/{project_id}/undo")
        assert undo_resp.status_code == 200
        get_undone = client.get(f"/projects/get/{project_id}")
        assert get_undone.json()["rows"][0][score_idx] == -20.0

        # Step 5: Redo transformation
        redo_resp = client.post(f"/projects/{project_id}/redo")
        assert redo_resp.status_code == 200
        get_redone = client.get(f"/projects/get/{project_id}")
        assert get_redone.json()["rows"][0][score_idx] == 0.0
