"""Comprehensive unit and HTTP semantics tests for statistical outlier remediation.

Covers detection methods (Tukey's IQR fences, Z-score distance, percentiles),
remediation actions (clipping/Winsorization, row dropping, nullification, and boolean flagging),
validation edge cases, pipeline reusability, and transactional API undo/redo.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas import (
    OperationType,
    OutlierParams,
    OutlierTransformMethod,
    QualityAssessRequest,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    handle_outliers,
    operation_summary,
)


@pytest.fixture
def sample_numeric_df():
    """Sample DataFrame with standard distribution and extreme outliers."""
    # Base values around 100 with two extreme outliers: -500 and 1000
    data = {
        "id": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "score": [100.0, 102.0, 98.0, 105.0, 95.0, 101.0, 99.0, 103.0, -500.0, 1000.0],
        "category": ["A", "A", "B", "B", "A", "B", "A", "B", "A", "B"],
    }
    return pd.DataFrame(data)


class TestOutlierDetectionMethods:
    """Tests for statistical outlier boundary calculations."""

    def test_outlier_iqr_clip(self, sample_numeric_df):
        """Tukey's IQR method clips extreme values to Q1 - 1.5*IQR and Q3 + 1.5*IQR."""
        result = handle_outliers(sample_numeric_df, column="score", method="iqr", action="clip", sensitivity=1.5)

        # Neither -500 nor 1000 should remain; they should be clamped to bounds
        assert result["score"].min() > -500.0
        assert result["score"].max() < 1000.0
        # Normal observations (index 0 to 7) remain unmodified
        assert result.loc[0, "score"] == 100.0
        assert result.loc[1, "score"] == 102.0

    def test_outlier_iqr_custom_sensitivity(self, sample_numeric_df):
        """Custom sensitivity adjusts fence breadth (tighter fence flags more values)."""
        # Tighter fence (k=0.5) should clamp closer to the median
        tight = handle_outliers(sample_numeric_df, column="score", method="iqr", action="clip", sensitivity=0.5)
        # Wider fence (k=3.0) allows larger deviations
        wide = handle_outliers(sample_numeric_df, column="score", method="iqr", action="clip", sensitivity=3.0)

        assert tight["score"].max() < wide["score"].max()

    def test_outlier_zscore_clip(self, sample_numeric_df):
        """Z-score distance flags values exceeding the standard deviation threshold."""
        result = handle_outliers(sample_numeric_df, column="score", method="zscore", action="clip", sensitivity=1.5)

        assert result["score"].min() > -500.0
        assert result["score"].max() < 1000.0
        assert len(result) == len(sample_numeric_df)

    def test_outlier_zscore_zero_variance(self):
        """When column values are identical (std=0), handles zero variance without error."""
        df = pd.DataFrame({"constant": [42.0, 42.0, 42.0, 42.0, 42.0]})
        result = handle_outliers(df, column="constant", method="zscore", action="clip")

        # All values remain 42.0 and no exception is raised
        assert (result["constant"] == 42.0).all()

    def test_outlier_percentile_bounds(self, sample_numeric_df):
        """Percentile method clamps values to the specified quantiles."""
        result = handle_outliers(
            sample_numeric_df,
            column="score",
            method="percentile",
            action="clip",
            lower_percentile=0.10,
            upper_percentile=0.90,
        )

        non_outliers = sample_numeric_df["score"]
        lower_q = non_outliers.quantile(0.10)
        upper_q = non_outliers.quantile(0.90)

        assert np.isclose(result["score"].min(), lower_q)
        assert np.isclose(result["score"].max(), upper_q)


class TestOutlierRemediationActions:
    """Tests for all four remediation strategies: clip, drop, set_null, and flag."""

    def test_action_drop_rows(self, sample_numeric_df):
        """Drop action removes rows containing outlier values and resets index."""
        result = handle_outliers(sample_numeric_df, column="score", method="iqr", action="drop")

        # Two outliers (-500 and 1000) removed, resulting in 8 rows
        assert len(result) == 8
        assert -500.0 not in result["score"].values
        assert 1000.0 not in result["score"].values
        # Index must be a clean 0..N-1 range
        assert list(result.index) == list(range(8))

    def test_action_set_null(self, sample_numeric_df):
        """Set_null action converts outlier cells to NaN for downstream imputation."""
        result = handle_outliers(sample_numeric_df, column="score", method="iqr", action="set_null")

        assert len(result) == 10
        # Exactly 2 null values created where the outliers were located
        assert result["score"].isna().sum() == 2
        assert pd.isna(result.loc[8, "score"])
        assert pd.isna(result.loc[9, "score"])
        # Normal rows remain populated
        assert not pd.isna(result.loc[0, "score"])

    def test_action_set_null_on_integer_column(self):
        """Integer column is safely upcast to float so NaN can be stored without error."""
        df = pd.DataFrame({"count": [10, 11, 12, 10, 11, 1000]})
        result = handle_outliers(df, column="count", method="iqr", action="set_null")

        assert pd.isna(result.loc[5, "count"])
        assert result.loc[0, "count"] == 10.0

    def test_action_flag_default_column_name(self, sample_numeric_df):
        """Flag action appends a boolean column '<col>_is_outlier' without altering original data."""
        result = handle_outliers(sample_numeric_df, column="score", method="iqr", action="flag")

        assert "score_is_outlier" in result.columns
        assert len(result.columns) == len(sample_numeric_df.columns) + 1
        # Original score values remain unchanged
        assert result.loc[8, "score"] == -500.0
        assert result.loc[9, "score"] == 1000.0
        # Flag indicates true for the outliers
        assert result.loc[8, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[9, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[0, "score_is_outlier"] == False  # noqa: E712

    def test_action_flag_custom_column_name(self, sample_numeric_df):
        """Flag action uses custom flag_column when provided."""
        result = handle_outliers(
            sample_numeric_df,
            column="score",
            method="iqr",
            action="flag",
            flag_column="anomaly_detected",
        )

        assert "anomaly_detected" in result.columns
        assert result.loc[8, "anomaly_detected"] == True  # noqa: E712
        assert result.loc[0, "anomaly_detected"] == False  # noqa: E712

    def test_outlier_zscore_drop(self, sample_numeric_df):
        """Z-score method with drop action removes extreme variance rows."""
        result = handle_outliers(sample_numeric_df, column="score", method="zscore", action="drop", sensitivity=1.5)
        assert len(result) == 8
        assert -500.0 not in result["score"].values
        assert 1000.0 not in result["score"].values

    def test_outlier_zscore_set_null(self, sample_numeric_df):
        """Z-score method with set_null action converts extreme variance rows to NaN."""
        result = handle_outliers(sample_numeric_df, column="score", method="zscore", action="set_null", sensitivity=1.5)
        assert len(result) == 10
        assert result["score"].isna().sum() == 2

    def test_outlier_zscore_flag(self, sample_numeric_df):
        """Z-score method with flag action appends boolean indicator column."""
        result = handle_outliers(sample_numeric_df, column="score", method="zscore", action="flag", sensitivity=1.5)
        assert "score_is_outlier" in result.columns
        assert result.loc[8, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[9, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[0, "score_is_outlier"] == False  # noqa: E712

    def test_outlier_percentile_drop(self, sample_numeric_df):
        """Percentile method with drop action removes values outside quantile cutoffs."""
        result = handle_outliers(
            sample_numeric_df,
            column="score",
            method="percentile",
            action="drop",
            lower_percentile=0.05,
            upper_percentile=0.95,
        )
        assert len(result) == 8
        assert -500.0 not in result["score"].values
        assert 1000.0 not in result["score"].values

    def test_outlier_percentile_set_null(self, sample_numeric_df):
        """Percentile method with set_null action nullifies values outside quantile cutoffs."""
        result = handle_outliers(
            sample_numeric_df,
            column="score",
            method="percentile",
            action="set_null",
            lower_percentile=0.05,
            upper_percentile=0.95,
        )
        assert len(result) == 10
        assert result["score"].isna().sum() == 2

    def test_outlier_percentile_flag(self, sample_numeric_df):
        """Percentile method with flag action marks values outside quantile cutoffs."""
        result = handle_outliers(
            sample_numeric_df,
            column="score",
            method="percentile",
            action="flag",
            lower_percentile=0.05,
            upper_percentile=0.95,
        )
        assert "score_is_outlier" in result.columns
        assert result.loc[8, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[9, "score_is_outlier"] == True  # noqa: E712
        assert result.loc[0, "score_is_outlier"] == False  # noqa: E712


class TestOutlierValidationAndEdgeCases:
    """Validation guardrails, malformed inputs, and edge cases."""

    def test_missing_column_raises_error(self, sample_numeric_df):
        """Nonexistent column name raises TransformationError with available columns."""
        with pytest.raises(TransformationError, match="Column 'nonexistent' not found"):
            handle_outliers(sample_numeric_df, column="nonexistent")

    def test_non_numeric_column_raises_error(self, sample_numeric_df):
        """String / non-numeric column raises TransformationError."""
        with pytest.raises(TransformationError, match="is not numeric"):
            handle_outliers(sample_numeric_df, column="category")

    @pytest.mark.parametrize("method", ["iqr", "zscore", "percentile"])
    @pytest.mark.parametrize("action", ["clip", "drop", "set_null", "flag"])
    def test_datetime_column_raises(self, method, action):
        """A datetime column must be rejected, not silently rewritten as
        nanosecond integers: pd.to_numeric converts datetimes to ints
        instead of NaN, so the coercion guard used to let them through and
        every date came back as 1704067200000000."""
        df = pd.DataFrame(
            {
                "when": pd.to_datetime(
                    ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-06-01"]
                )
            }
        )
        with pytest.raises(TransformationError, match="requires numeric data"):
            handle_outliers(df, column="when", method=method, action=action)

    def test_timedelta_column_raises(self):
        """Timedeltas hit the same to_numeric trap as datetimes."""
        df = pd.DataFrame({"span": pd.to_timedelta(["1 days", "2 days", "3 days", "4 days", "5 days"])})
        with pytest.raises(TransformationError, match="requires numeric data"):
            handle_outliers(df, column="span", method="iqr", action="clip")

    def test_datetime_column_with_few_values_raises(self):
        """The fewer-than-4-values early return also rewrote the column, so
        the guard must sit before the coercion, not after it."""
        df = pd.DataFrame({"when": pd.to_datetime(["2024-01-01", "2024-01-02", "2024-06-01"])})
        with pytest.raises(TransformationError, match="requires numeric data"):
            handle_outliers(df, column="when", method="iqr", action="clip")

    def test_whitespace_in_column_name_trimmed(self, sample_numeric_df):
        """Leading/trailing whitespace in target column name is resolved gracefully."""
        result = handle_outliers(sample_numeric_df, column="  score  ", method="iqr", action="drop")
        assert len(result) == 8

    def test_small_sample_size_preserved(self):
        """Columns with fewer than 4 non-null values return unchanged without error."""
        df = pd.DataFrame({"small": [10.0, 500.0, None]})
        result = handle_outliers(df, column="small", method="iqr", action="drop")
        # Too small to establish meaningful fences; preserved as-is
        assert len(result) == 3

    def test_invalid_method_raises_error(self, sample_numeric_df):
        """Unsupported detection method raises TransformationError."""
        with pytest.raises(TransformationError, match="Unknown outlier method"):
            handle_outliers(sample_numeric_df, column="score", method="magic_wand")

    def test_invalid_action_raises_error(self, sample_numeric_df):
        """Unsupported remediation action raises TransformationError."""
        with pytest.raises(TransformationError, match="Unknown outlier action"):
            handle_outliers(sample_numeric_df, column="score", action="obliterate")

    def test_negative_sensitivity_raises_error(self, sample_numeric_df):
        """Non-positive sensitivity raises TransformationError."""
        with pytest.raises(TransformationError, match="must be positive"):
            handle_outliers(sample_numeric_df, column="score", method="iqr", sensitivity=-1.0)

    def test_inverted_percentiles_raises_error(self, sample_numeric_df):
        """Lower percentile greater than or equal to upper percentile raises TransformationError."""
        with pytest.raises(TransformationError, match="Invalid percentiles"):
            handle_outliers(
                sample_numeric_df,
                column="score",
                method="percentile",
                lower_percentile=0.95,
                upper_percentile=0.05,
            )

    def test_existing_nulls_preserved(self):
        """Existing NaN values are not treated as outliers and are preserved."""
        df = pd.DataFrame({"val": [10.0, 11.0, 12.0, 10.0, 11.0, np.nan, 500.0]})
        result = handle_outliers(df, column="val", method="iqr", action="drop")

        # 500.0 is dropped as an outlier, but np.nan row is preserved
        assert 500.0 not in result["val"].values
        assert result["val"].isna().sum() == 1

    def test_numeric_string_column_coerced_and_handled(self):
        """Numeric values formatted as strings are safely coerced and outliers handled."""
        df = pd.DataFrame({"num_str": ["100", "102", "98", "105", "95", "101", "1000"]})
        result = handle_outliers(df, column="num_str", method="iqr", action="drop")
        assert len(result) == 6
        assert "1000" not in result["num_str"].values
        assert 1000 not in result["num_str"].values
        assert pd.api.types.is_numeric_dtype(result["num_str"])

    def test_set_null_preserves_integer_dtype_when_no_outliers(self):
        """When action='set_null' and no outliers are detected, integer column dtype is preserved."""
        df = pd.DataFrame({"val": [10, 11, 10, 12, 11, 10]})
        result = handle_outliers(df, column="val", method="iqr", action="set_null")
        assert pd.api.types.is_integer_dtype(result["val"])

    def test_outlier_params_schema_validation(self):
        """Pydantic model OutlierParams enforces strict field validation."""
        # Non-positive sensitivity rejected
        with pytest.raises(ValidationError):
            OutlierParams(column="val", sensitivity=-2.0)

        with pytest.raises(ValidationError):
            OutlierParams(column="val", sensitivity=0.0)

        # Inverted percentiles rejected
        with pytest.raises(ValidationError):
            OutlierParams(
                column="val", method=OutlierTransformMethod.percentile, lower_percentile=0.9, upper_percentile=0.1
            )

        # Lone percentiles rejected against default bound (0.01 and 0.99)
        with pytest.raises(ValidationError):
            OutlierParams(column="val", lower_percentile=0.99)

        with pytest.raises(ValidationError):
            OutlierParams(column="val", upper_percentile=0.01)

    def test_boolean_column_rejected(self):
        """Boolean column is rejected as outlier detection requires numeric data."""
        df = pd.DataFrame({"is_active": [True, False, True, True, False]})
        with pytest.raises(TransformationError, match="boolean"):
            handle_outliers(df, column="is_active")

    def test_flag_column_collision_raises_error(self, sample_numeric_df):
        """Flag action raises TransformationError if destination column already exists."""
        df = sample_numeric_df.copy()
        df["score_is_outlier"] = False
        with pytest.raises(TransformationError, match="already exists"):
            handle_outliers(df, column="score", method="iqr", action="flag")

    def test_flag_column_whitespace_collision_raises_error(self, sample_numeric_df):
        """Flag action raises TransformationError if destination column exists with whitespace."""
        df = sample_numeric_df.copy()
        df["score_is_outlier "] = False
        with pytest.raises(TransformationError, match="already exists"):
            handle_outliers(df, column="score", method="iqr", action="flag")

    def test_outlier_set_null_preserves_nullable_integer_dtype(self):
        """set_null assigns pd.NA to outliers in nullable integer columns without converting to float."""
        df = pd.DataFrame({"count": pd.Series([10, 11, 10, 12, 11, 10, 500], dtype="Int64")})
        result = handle_outliers(df, column="count", method="iqr", action="set_null")
        assert result["count"].dtype == "Int64"
        assert result["count"].iloc[-1] is pd.NA

    def test_outlier_zscore_constant_column_clip_untouched(self):
        """Z-score method with clip action on constant column leaves values untouched."""
        df = pd.DataFrame({"const": [42.0, 42.0, 42.0, 42.0, 42.0]})
        result = handle_outliers(df, column="const", method="zscore", action="clip")
        assert (result["const"] == 42.0).all()

    def test_small_sample_size_flag_action_appends_column(self):
        """Columns with fewer than 4 non-null values still append flag column with False."""
        df = pd.DataFrame({"small": [10.0, 500.0, None]})
        result = handle_outliers(df, column="small", method="iqr", action="flag")
        assert "small_is_outlier" in result.columns
        assert not result["small_is_outlier"].any()
        assert len(result) == 3

    def test_quality_assess_request_rejects_percentile(self):
        """QualityAssessRequest only accepts 'iqr' and 'zscore', rejecting 'percentile'."""
        with pytest.raises(ValidationError):
            QualityAssessRequest(outlier_method="percentile")


class TestOutlierPipelineAndHttpSemantics:
    """Registry compliance, pipeline reusability, summary generation, and API endpoint integration."""

    def test_transformation_registry_spec(self):
        """handleOutliers is registered in TRANSFORMATION_REGISTRY and marked reusable for pipelines."""
        spec = TRANSFORMATION_REGISTRY[OperationType.handleOutliers]
        assert spec.func == "handle_outliers"
        assert spec.label == "Handle outliers"
        assert spec.params_field == "outlier_params"
        assert spec.reusable is True

    def test_apply_logged_transformation_replay(self, sample_numeric_df):
        """Pipeline replay via apply_logged_transformation applies handleOutliers correctly."""
        details = {
            "outlier_params": {
                "column": "score",
                "method": "iqr",
                "action": "drop",
            }
        }
        replayed_df = apply_logged_transformation(sample_numeric_df, OperationType.handleOutliers, details)
        assert len(replayed_df) == 8
        assert -500.0 not in replayed_df["score"].values
        assert 1000.0 not in replayed_df["score"].values

    def test_operation_summary_generation(self):
        """operation_summary formats clean human-readable parameter descriptions."""
        details = {
            "outlier_params": {
                "column": "salary",
                "method": "iqr",
                "action": "clip",
                "sensitivity": 1.5,
            }
        }
        summary = operation_summary(OperationType.handleOutliers, details)
        assert "column: salary" in summary
        assert "method: iqr" in summary
        assert "action: clip" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client, monkeypatch):
        """HTTP /projects/{id}/transform executes handleOutliers in preview and commit modes."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_data = "id,val\n1,10\n2,11\n3,10\n4,12\n5,11\n6,1000\n"
        upload_res = client.post(
            "/projects/upload",
            files={"file": ("outlier_test.csv", csv_data.encode("utf-8"), "text/csv")},
            data={"projectName": "Outlier API Test", "projectDescription": "Test fixture"},
        )
        assert upload_res.status_code == 200
        proj_id = upload_res.json()["project_id"]

        # 1. Preview mode (preview=true)
        prev_payload = {
            "operation_type": "handleOutliers",
            "outlier_params": {
                "column": "val",
                "method": "iqr",
                "action": "drop",
            },
        }
        prev_res = client.post(f"/projects/{proj_id}/transform", params={"preview": "true"}, json=prev_payload)
        assert prev_res.status_code == 200
        prev_data = prev_res.json()
        assert prev_data["total_rows"] == 5
        val_idx = prev_data["columns"].index("val")
        prev_vals = [row[val_idx] for row in prev_data["rows"]]
        assert 1000 not in prev_vals
        assert len(prev_vals) == 5

        # Confirm underlying file remains uncommitted (still 6 rows with 1000 present)
        curr = client.get(f"/projects/get/{proj_id}").json()
        assert curr["total_rows"] == 6
        curr_vals = [row[val_idx] for row in curr["rows"]]
        assert 1000 in curr_vals

        # 2. Commit mode (default preview=false)
        commit_res = client.post(f"/projects/{proj_id}/transform", json=prev_payload)
        assert commit_res.status_code == 200
        commit_data = commit_res.json()
        assert commit_data["total_rows"] == 5
        committed_vals = [row[val_idx] for row in commit_data["rows"]]
        assert 1000 not in committed_vals

        # Check working copy persisted (outlier dropped)
        after_commit = client.get(f"/projects/get/{proj_id}").json()
        assert after_commit["total_rows"] == 5
        after_vals = [row[val_idx] for row in after_commit["rows"]]
        assert 1000 not in after_vals

        # 3. Undo / Redo lifecycle
        undo_res = client.post(f"/projects/{proj_id}/undo")
        assert undo_res.status_code == 200
        undone = client.get(f"/projects/get/{proj_id}").json()
        assert undone["total_rows"] == 6
        undone_vals = [row[val_idx] for row in undone["rows"]]
        assert 1000 in undone_vals

        redo_res = client.post(f"/projects/{proj_id}/redo")
        assert redo_res.status_code == 200
        redone = client.get(f"/projects/get/{proj_id}").json()
        assert redone["total_rows"] == 5
        redone_vals = [row[val_idx] for row in redone["rows"]]
        assert 1000 not in redone_vals

    def test_http_outliers_on_datetime_column_returns_400(self, client, monkeypatch):
        """handleOutliers on a date column must be a 400, not a 200 that
        rewrites every date as a nanosecond integer."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_data = "id,event_date\n1,2024-01-01\n2,2024-01-02\n3,2024-01-03\n4,2024-01-04\n5,2024-01-05\n6,2024-06-01\n"
        upload_res = client.post(
            "/projects/upload",
            files={"file": ("dates.csv", csv_data.encode("utf-8"), "text/csv")},
            data={"projectName": "Outlier Dates", "projectDescription": "Test fixture"},
        )
        assert upload_res.status_code == 200
        proj_id = upload_res.json()["project_id"]
        res = client.post(
            f"/projects/{proj_id}/transform",
            json={
                "operation_type": "handleOutliers",
                "outlier_params": {"column": "event_date", "method": "iqr", "action": "clip"},
            },
        )
        assert res.status_code == 400, res.text
        assert "requires numeric data" in res.json()["detail"]
