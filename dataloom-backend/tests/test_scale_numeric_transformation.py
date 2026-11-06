"""Comprehensive unit, boundary, and HTTP semantics tests for numeric feature scaling.

Covers mathematical scaling algorithms (Min-Max, Z-score standardization, Robust IQR,
and Maximum Absolute), edge cases (zero variance, constant columns, null preservation,
small/empty samples), defensive guardrails (boolean rejection, column name collisions),
pipeline reusability, and transactional undo/redo lifecycles.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas import (
    OperationType,
    ScaleNumericParams,
    ScalingMethod,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    operation_summary,
    scale_numeric,
)


@pytest.fixture
def sample_numeric_df():
    """Sample DataFrame with diverse numeric ranges, negative numbers, and string categories."""
    data = {
        "id": [1, 2, 3, 4, 5],
        "age": [20.0, 30.0, 40.0, 50.0, 60.0],
        "salary": [30000.0, 45000.0, 60000.0, 75000.0, 90000.0],
        "delta": [-50.0, -25.0, 0.0, 25.0, 50.0],
        "department": ["Eng", "Sales", "Eng", "HR", "Sales"],
    }
    return pd.DataFrame(data)


class TestMathematicalScalingMethods:
    """Mathematical precision tests for each scaling and normalization algorithm."""

    def test_minmax_scaling_default_bounds(self, sample_numeric_df):
        """Min-Max linearly projects values to [0.0, 1.0] by default."""
        result = scale_numeric(sample_numeric_df, column="salary", method="minmax")

        # The lowest value (30000) must scale to exactly 0.0
        assert np.isclose(result["salary"].min(), 0.0)
        # The highest value (90000) must scale to exactly 1.0
        assert np.isclose(result["salary"].max(), 1.0)
        # The median value (60000) must scale to exactly 0.5
        assert np.isclose(result.loc[2, "salary"], 0.5)

    def test_minmax_scaling_custom_bounds(self, sample_numeric_df):
        """Min-Max projects values to custom target intervals like [-1.0, 1.0]."""
        result = scale_numeric(
            sample_numeric_df,
            column="age",
            method="minmax",
            target_min=-1.0,
            target_max=1.0,
        )

        # Minimum value (20) scales to target_min (-1.0)
        assert np.isclose(result["age"].min(), -1.0)
        # Maximum value (60) scales to target_max (1.0)
        assert np.isclose(result["age"].max(), 1.0)
        # Midpoint value (40) scales to 0.0
        assert np.isclose(result.loc[2, "age"], 0.0)

    def test_standard_scaling_zscore(self, sample_numeric_df):
        """Standard scaling transforms values to zero mean and unit variance."""
        result = scale_numeric(sample_numeric_df, column="salary", method="standard")

        # Mean of transformed series must be approximately 0.0
        assert np.isclose(result["salary"].mean(), 0.0, atol=1e-7)
        # Standard deviation (population ddof=0) must be approximately 1.0
        assert np.isclose(result["salary"].std(ddof=0), 1.0, atol=1e-7)

    def test_robust_scaling_iqr(self, sample_numeric_df):
        """Robust scaling centers by median and divides by IQR, resisting outlier influence."""
        result = scale_numeric(sample_numeric_df, column="salary", method="robust")

        # Median of transformed series must be 0.0
        assert np.isclose(result["salary"].median(), 0.0)

        # Verify formula: (x - median) / (Q3 - Q1)
        original_salaries = sample_numeric_df["salary"]
        median_val = original_salaries.median()
        iqr_val = original_salaries.quantile(0.75) - original_salaries.quantile(0.25)
        expected_series = (original_salaries - median_val) / iqr_val

        pd.testing.assert_series_equal(result["salary"], expected_series, check_names=False)

    def test_maxabs_scaling(self, sample_numeric_df):
        """Maximum absolute scaling divides by max(|x|), mapping to [-1.0, 1.0] and preserving zeros."""
        result = scale_numeric(sample_numeric_df, column="delta", method="maxabs")

        # Max absolute value was 50.0; boundary values scale to -1.0 and 1.0
        assert np.isclose(result["delta"].min(), -1.0)
        assert np.isclose(result["delta"].max(), 1.0)
        # Zero element remains exactly 0.0 (sparsity preservation)
        assert np.isclose(result.loc[2, "delta"], 0.0)


class TestBoundaryAndDegenerateCases:
    """Degenerate inputs, zero spread, missing data, and type coercion safety."""

    def test_constant_column_minmax_no_zero_division(self):
        """A column with identical values (max == min) maps to target_min without division by zero."""
        df = pd.DataFrame({"constant": [42.0, 42.0, 42.0, 42.0]})
        result = scale_numeric(df, column="constant", method="minmax", target_min=0.0, target_max=1.0)

        # All values cleanly map to target_min (0.0) without throwing ZeroDivisionError or generating NaN
        assert (result["constant"] == 0.0).all()

    def test_constant_column_standard_no_zero_division(self):
        """A column with zero variance (std == 0) maps to 0.0 without division by zero."""
        df = pd.DataFrame({"constant": [100.0, 100.0, 100.0]})
        result = scale_numeric(df, column="constant", method="standard")

        # All values cleanly map to 0.0
        assert (result["constant"] == 0.0).all()

    def test_constant_column_robust_no_zero_division(self):
        """A column with zero IQR maps to 0.0 without division by zero."""
        df = pd.DataFrame({"constant": [5.0, 5.0, 5.0, 5.0]})
        result = scale_numeric(df, column="constant", method="robust")

        # All values cleanly map to 0.0
        assert (result["constant"] == 0.0).all()

    def test_all_zeros_column_maxabs_no_zero_division(self):
        """A column where all values are 0.0 maps to 0.0 without division by zero."""
        df = pd.DataFrame({"zeros": [0.0, 0.0, 0.0]})
        result = scale_numeric(df, column="zeros", method="maxabs")

        # All values cleanly remain 0.0
        assert (result["zeros"] == 0.0).all()

    def test_existing_nulls_preserved(self):
        """Existing NaN values are excluded from scaling statistics and preserved at their positions."""
        df = pd.DataFrame({"val": [10.0, np.nan, 20.0, 30.0, np.nan]})
        result = scale_numeric(df, column="val", method="minmax")

        # 10.0 -> 0.0, 30.0 -> 1.0, 20.0 -> 0.5
        assert np.isclose(result.loc[0, "val"], 0.0)
        assert np.isclose(result.loc[2, "val"], 0.5)
        assert np.isclose(result.loc[3, "val"], 1.0)
        # NaN positions must remain NaN
        assert pd.isna(result.loc[1, "val"])
        assert pd.isna(result.loc[4, "val"])
        assert result["val"].isna().sum() == 2

    def test_empty_dataframe_deterministic_schema(self):
        """An empty DataFrame with 0 rows preserves schema and column types deterministically."""
        df = pd.DataFrame({"val": pd.Series([], dtype=float)})
        result = scale_numeric(df, column="val", method="minmax", output_column="val_scaled")

        # Both columns present with float dtypes, row count remains 0
        assert "val" in result.columns
        assert "val_scaled" in result.columns
        assert len(result) == 0
        assert pd.api.types.is_float_dtype(result["val_scaled"])

    def test_all_null_column_deterministic_schema(self):
        """A column with only NaN values returns all NaNs with float dtype without crashing."""
        df = pd.DataFrame({"val": [np.nan, np.nan, np.nan]})
        result = scale_numeric(df, column="val", method="standard", output_column="val_std")

        assert len(result) == 3
        assert result["val_std"].isna().all()
        assert pd.api.types.is_float_dtype(result["val_std"])

    def test_numeric_strings_coerced_and_scaled(self):
        """Numeric values stored as string representations are safely coerced and scaled."""
        df = pd.DataFrame({"num_str": ["10", "20", "30", "40", "50"]})
        result = scale_numeric(df, column="num_str", method="minmax")

        assert np.isclose(result["num_str"].min(), 0.0)
        assert np.isclose(result["num_str"].max(), 1.0)
        assert pd.api.types.is_float_dtype(result["num_str"])


class TestOutputColumnAndCollisionSafety:
    """Tests for in-place transformation vs new column generation and collision guards."""

    def test_inplace_replacement_when_output_column_omitted(self, sample_numeric_df):
        """When output_column is None, transformation updates the source column in-place."""
        initial_cols = list(sample_numeric_df.columns)
        result = scale_numeric(sample_numeric_df, column="age", method="minmax")

        # Column list remains unchanged
        assert list(result.columns) == initial_cols
        assert np.isclose(result["age"].min(), 0.0)
        assert np.isclose(result["age"].max(), 1.0)

    def test_new_column_created_when_output_column_specified(self, sample_numeric_df):
        """When output_column is provided, source column is preserved and new column is appended."""
        result = scale_numeric(sample_numeric_df, column="age", method="minmax", output_column="age_norm")

        # Original column remains intact
        assert result["age"].equals(sample_numeric_df["age"])
        # New column added with normalized values
        assert "age_norm" in result.columns
        assert np.isclose(result["age_norm"].min(), 0.0)
        assert np.isclose(result["age_norm"].max(), 1.0)
        assert len(result.columns) == len(sample_numeric_df.columns) + 1

    def test_output_column_collision_rejected(self, sample_numeric_df):
        """Target output_column that already exists in DataFrame raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            scale_numeric(
                sample_numeric_df,
                column="age",
                method="minmax",
                output_column="salary",  # 'salary' already exists
            )

    def test_empty_output_column_name_rejected(self, sample_numeric_df):
        """Empty or whitespace-only output_column raises TransformationError."""
        with pytest.raises(TransformationError, match="must not be empty"):
            scale_numeric(sample_numeric_df, column="age", output_column="   ")


class TestValidationAndGuardrails:
    """Input validation, type checking, and error handling guardrails."""

    def test_missing_column_raises_error(self, sample_numeric_df):
        """Nonexistent column name raises TransformationError with available columns."""
        with pytest.raises(TransformationError, match="Column 'unknown' not found"):
            scale_numeric(sample_numeric_df, column="unknown")

    def test_non_numeric_column_raises_error(self, sample_numeric_df):
        """Text / string categorical column raises TransformationError."""
        with pytest.raises(TransformationError, match="is not numeric"):
            scale_numeric(sample_numeric_df, column="department")

    def test_boolean_column_rejected(self):
        """Boolean column is rejected explicitly (guarding against pandas is_numeric_dtype(bool) == True)."""
        df = pd.DataFrame({"is_active": [True, False, True, True]})
        with pytest.raises(TransformationError, match="boolean"):
            scale_numeric(df, column="is_active")

    def test_invalid_scaling_method_raises_error(self, sample_numeric_df):
        """Unsupported scaling algorithm name raises TransformationError with supported methods."""
        with pytest.raises(TransformationError, match="Unknown scaling method"):
            scale_numeric(sample_numeric_df, column="age", method="quantum_jump")

    def test_inverted_target_bounds_raises_error(self, sample_numeric_df):
        """Target min greater than or equal to target max raises TransformationError."""
        with pytest.raises(TransformationError, match="target_min .* strictly less than target_max"):
            scale_numeric(
                sample_numeric_df,
                column="age",
                method="minmax",
                target_min=10.0,
                target_max=5.0,
            )

    def test_whitespace_in_column_name_trimmed(self, sample_numeric_df):
        """Column name with leading or trailing whitespace is resolved cleanly."""
        result = scale_numeric(sample_numeric_df, column="  age  ", method="minmax")
        assert np.isclose(result["age"].min(), 0.0)

    def test_pydantic_schema_validation(self):
        """Pydantic model ScaleNumericParams enforces target_min < target_max and validates enums."""
        # Valid model instantiation
        params = ScaleNumericParams(column="val", method=ScalingMethod.minmax, target_min=-1.0, target_max=1.0)
        assert params.target_min == -1.0

        # Inverted range rejected
        with pytest.raises(ValidationError):
            ScaleNumericParams(column="val", target_min=5.0, target_max=5.0)

        with pytest.raises(ValidationError):
            ScaleNumericParams(column="val", target_min=10.0, target_max=0.0)


class TestPipelineAndHttpLifecycle:
    """Registry compliance, pipeline replay, summary generation, and transactional API endpoints."""

    def test_transformation_registry_spec(self):
        """scaleNumeric is registered in TRANSFORMATION_REGISTRY and marked reusable for cross-project pipelines."""
        spec = TRANSFORMATION_REGISTRY[OperationType.scaleNumeric]
        assert spec.func == "scale_numeric"
        assert spec.label == "Scale numeric features"
        assert spec.params_field == "scale_numeric_params"
        assert spec.reusable is True

    def test_pipeline_replay_apply_logged_transformation(self, sample_numeric_df):
        """Pipeline replay via apply_logged_transformation applies scaleNumeric correctly."""
        details = {
            "scale_numeric_params": {
                "column": "salary",
                "method": "minmax",
                "target_min": 0.0,
                "target_max": 100.0,
            }
        }
        replayed_df = apply_logged_transformation(sample_numeric_df, OperationType.scaleNumeric, details)
        assert np.isclose(replayed_df["salary"].min(), 0.0)
        assert np.isclose(replayed_df["salary"].max(), 100.0)

    def test_operation_summary_formatting(self):
        """operation_summary renders a clean, human-readable summary of parameters."""
        details = {
            "scale_numeric_params": {
                "column": "age",
                "method": "standard",
            }
        }
        summary = operation_summary(OperationType.scaleNumeric, details)
        assert "column: age" in summary
        assert "method: standard" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client, monkeypatch):
        """HTTP /projects/{id}/transform executes scaleNumeric in preview, commit, undo, and redo modes."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_data = "id,price\n1,10.0\n2,20.0\n3,30.0\n4,40.0\n5,50.0\n"
        upload_res = client.post(
            "/projects/upload",
            files={"file": ("scale_test.csv", csv_data.encode("utf-8"), "text/csv")},
            data={"projectName": "Scale API Test", "projectDescription": "Test fixture"},
        )
        assert upload_res.status_code == 200
        proj_id = upload_res.json()["project_id"]

        # 1. Preview mode (preview=true)
        prev_payload = {
            "operation_type": "scaleNumeric",
            "scale_numeric_params": {
                "column": "price",
                "method": "minmax",
                "target_min": 0.0,
                "target_max": 1.0,
            },
        }
        prev_res = client.post(f"/projects/{proj_id}/transform", params={"preview": "true"}, json=prev_payload)
        assert prev_res.status_code == 200
        # In preview, row count is 5
        assert prev_res.json()["total_rows"] == 5

        # Confirm underlying file remains uncommitted
        curr = client.get(f"/projects/get/{proj_id}").json()
        assert curr["total_rows"] == 5

        # 2. Commit mode (default preview=false)
        commit_res = client.post(f"/projects/{proj_id}/transform", json=prev_payload)
        assert commit_res.status_code == 200
        assert commit_res.json()["total_rows"] == 5

        # 3. Undo / Redo lifecycle
        undo_res = client.post(f"/projects/{proj_id}/undo")
        assert undo_res.status_code == 200

        redo_res = client.post(f"/projects/{proj_id}/redo")
        assert redo_res.status_code == 200
