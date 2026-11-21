"""Tests for the mathematical function transformation (mathTransform).

Verifies log, log10, log1p, exp, sqrt, and abs functions, domain error
validation, NaN preservation, column collision prevention, pipeline
replay, and full transactional HTTP preview/commit/undo/redo lifecycle.
"""

import io

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.schemas import (
    MathFunction,
    MathTransformParams,
    OperationType,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    math_transform,
    operation_summary,
)


@pytest.fixture
def sample_math_df() -> pd.DataFrame:
    """Fixture providing positive numeric values for mathematical operations."""
    return pd.DataFrame(
        {
            "id": [1, 2, 3],
            "val": [1.0, 10.0, 100.0],
            "label": ["A", "B", "C"],
        }
    )


class TestMathTransformFunctions:
    """Test suite for mathematical function implementations."""

    def test_log_and_log10(self, sample_math_df: pd.DataFrame):
        """Verify natural log and base-10 log calculations."""
        res_log = math_transform(sample_math_df, column="val", func="log")
        assert np.isclose(res_log["val"].iloc[0], 0.0)
        assert np.isclose(res_log["val"].iloc[1], np.log(10.0))

        res_log10 = math_transform(sample_math_df, column="val", func="log10")
        assert np.isclose(res_log10["val"].iloc[0], 0.0)
        assert np.isclose(res_log10["val"].iloc[1], 1.0)
        assert np.isclose(res_log10["val"].iloc[2], 2.0)

    def test_sqrt_and_abs(self):
        """Verify square root and absolute value calculations."""
        df = pd.DataFrame({"num": [-4.0, -9.0, 16.0]})
        res_abs = math_transform(df, column="num", func="abs")
        assert res_abs["num"].tolist() == [4.0, 9.0, 16.0]

        res_sqrt = math_transform(res_abs, column="num", func="sqrt")
        assert res_sqrt["num"].tolist() == [2.0, 3.0, 4.0]

    def test_abs_int64_min_does_not_overflow(self):
        """Verify absolute value on INT64_MIN (-9223372036854775808) does not wrap to negative."""
        int64_min = -9223372036854775808
        df = pd.DataFrame({"val": pd.Series([int64_min, -42, 100], dtype="int64")})
        res = math_transform(df, column="val", func="abs")
        assert (res["val"] >= 0).all()
        assert np.isclose(res["val"].iloc[0], 9.223372036854776e18)
        assert res["val"].iloc[1] == 42.0
        assert res["val"].iloc[2] == 100.0

    def test_exp_and_log1p(self):
        """Verify exp and log1p functions."""
        df = pd.DataFrame({"num": [0.0, 1.0]})
        res_exp = math_transform(df, column="num", func="exp")
        assert np.isclose(res_exp["num"].iloc[0], 1.0)
        assert np.isclose(res_exp["num"].iloc[1], np.e)

        res_log1p = math_transform(df, column="num", func="log1p")
        assert np.isclose(res_log1p["num"].iloc[0], 0.0)

    def test_output_column_preserves_original(self, sample_math_df: pd.DataFrame):
        """Verify specifying output_column preserves original numeric column intact."""
        result = math_transform(sample_math_df, column="val", func="sqrt", output_column="val_sqrt")
        assert "val_sqrt" in result.columns
        assert result["val"].iloc[2] == 100.0
        assert np.isclose(result["val_sqrt"].iloc[2], 10.0)

    def test_preserves_missing_values(self):
        """Verify NaN / None values remain missing without raising errors."""
        df = pd.DataFrame({"val": [1.0, float("nan"), 100.0]})
        result = math_transform(df, column="val", func="log10")
        assert np.isclose(result["val"].iloc[0], 0.0)
        assert pd.isna(result["val"].iloc[1])
        assert np.isclose(result["val"].iloc[2], 2.0)


class TestGuardrailsAndDomainErrors:
    """Test suite for domain safety, input validation, and boundary conditions."""

    def test_missing_column_raises_error(self, sample_math_df: pd.DataFrame):
        """Verify non-existent column raises TransformationError."""
        with pytest.raises(TransformationError, match="Column 'non_existent' not found"):
            math_transform(sample_math_df, column="non_existent")

    def test_boolean_column_rejected(self):
        """Verify boolean column is rejected because bool is an invalid numeric candidate."""
        df = pd.DataFrame({"flag": [True, False]})
        with pytest.raises(TransformationError, match="is boolean"):
            math_transform(df, column="flag")

    def test_non_numeric_string_column_rejected(self):
        """Verify non-numeric text column is rejected with informative error."""
        df = pd.DataFrame({"text": ["apple", "banana"]})
        with pytest.raises(TransformationError, match="is not numeric"):
            math_transform(df, column="text")

    def test_log_with_non_positive_values_rejected(self):
        """Verify log on negative or zero values raises TransformationError."""
        df = pd.DataFrame({"val": [0.0, 5.0, 10.0]})
        with pytest.raises(TransformationError, match="non-positive values"):
            math_transform(df, column="val", func="log")

    def test_log1p_with_values_le_negative_one_rejected(self):
        """Verify log1p on values <= -1 raises TransformationError."""
        df = pd.DataFrame({"val": [-1.0, 0.0, 5.0]})
        with pytest.raises(TransformationError, match="values <= -1"):
            math_transform(df, column="val", func="log1p")

    def test_output_column_same_as_input_column_allowed(self, sample_math_df: pd.DataFrame):
        """Verify explicitly specifying output_column equal to input column transforms in-place without collision."""
        result = math_transform(sample_math_df, column="val", func="sqrt", output_column="val")
        assert np.isclose(result["val"].iloc[2], 10.0)

    def test_sqrt_with_negative_values_rejected(self):
        """Verify sqrt on negative values raises TransformationError."""
        df = pd.DataFrame({"val": [-4.0, 9.0]})
        with pytest.raises(TransformationError, match="negative values"):
            math_transform(df, column="val", func="sqrt")

    def test_output_column_collision_rejected(self, sample_math_df: pd.DataFrame):
        """Verify output_column collision raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            math_transform(sample_math_df, column="val", output_column="label")

    def test_exp_overflow_rejected(self):
        """Verify exp on large values causing overflow raises TransformationError."""
        df = pd.DataFrame({"val": [10.0, 1000.0]})
        with pytest.raises(TransformationError, match="overflow"):
            math_transform(df, column="val", func="exp")

    def test_output_column_whitespace_collision_rejected(self):
        """Verify output_column colliding with stripped existing column is rejected."""
        df = pd.DataFrame({"val": [1.0, 2.0], "target ": [3.0, 4.0]})
        with pytest.raises(TransformationError, match="already exists"):
            math_transform(df, column="val", output_column="target")

    def test_pydantic_schema_validation(self):
        """Verify Pydantic schema validation."""
        params = MathTransformParams(column="val", func=MathFunction.sqrt)
        assert params.column == "val"
        assert params.func == MathFunction.sqrt


class TestPipelineAndHttpLifecycle:
    """Test suite for pipeline registry integration and HTTP lifecycle."""

    def test_transformation_registry_spec(self):
        """Verify mathTransform registry spec is configured as reusable."""
        spec = TRANSFORMATION_REGISTRY.get(OperationType.mathTransform)
        assert spec is not None
        assert spec.func == "math_transform"
        assert spec.reusable is True

        payload = {"math_transform_params": {"column": "v", "func": "sqrt", "output_column": "out"}}
        args = spec.build_args(payload)
        assert args == ("v", "sqrt", "out")

    def test_pipeline_replay_apply_logged_transformation(self, sample_math_df: pd.DataFrame):
        """Verify apply_logged_transformation re-applies math transform cleanly."""
        details = {"math_transform_params": {"column": "val", "func": "log10"}}
        result = apply_logged_transformation(sample_math_df, OperationType.mathTransform, details)
        assert np.isclose(result["val"].iloc[2], 2.0)

    def test_operation_summary_formatting(self):
        """Verify operation_summary outputs clean human-readable parameter summary."""
        details = {"math_transform_params": {"column": "revenue", "func": "log"}}
        summary = operation_summary(OperationType.mathTransform, details)
        assert "column: revenue" in summary
        assert "func: log" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Verify full HTTP lifecycle: preview mode, commit persistence, undo, and redo."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_content = "id,score\n1,1.0\n2,100.0\n"
        files = {"file": ("math.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {"projectName": "Math Project", "projectDescription": "Math transform test"}
        upload_resp = client.post("/projects/upload", files=files, data=data)
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        transform_payload = {
            "operation_type": "mathTransform",
            "math_transform_params": {
                "column": "score",
                "func": "log10",
                "output_column": "score_log10",
            },
        }

        # Step 1: Preview mode (uncommitted)
        preview_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": "true"},
            json=transform_payload,
        )
        assert preview_resp.status_code == 200
        log_idx = preview_resp.json()["columns"].index("score_log10")
        assert np.isclose(preview_resp.json()["rows"][0][log_idx], 0.0)
        assert np.isclose(preview_resp.json()["rows"][1][log_idx], 2.0)

        # Step 2: Verify project remains uncommitted
        get_uncommitted = client.get(f"/projects/get/{project_id}")
        assert "score_log10" not in get_uncommitted.json()["columns"]

        # Step 3: Commit transformation
        commit_resp = client.post(f"/projects/{project_id}/transform", json=transform_payload)
        assert commit_resp.status_code == 200
        get_committed = client.get(f"/projects/get/{project_id}")
        assert "score_log10" in get_committed.json()["columns"]

        # Step 4: Undo transformation
        undo_resp = client.post(f"/projects/{project_id}/undo")
        assert undo_resp.status_code == 200
        get_undone = client.get(f"/projects/get/{project_id}")
        assert "score_log10" not in get_undone.json()["columns"]

        # Step 5: Redo transformation
        redo_resp = client.post(f"/projects/{project_id}/redo")
        assert redo_resp.status_code == 200
        get_redone = client.get(f"/projects/get/{project_id}")
        assert "score_log10" in get_redone.json()["columns"]
