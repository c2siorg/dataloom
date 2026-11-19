"""Tests for the datetime component extraction transformation (extractDatePart).

Verifies extraction of year, month, day, day_of_week, hour, and quarter,
handling of NaT/nulls, unparseable strings, column collision prevention,
pipeline replay, and full transactional HTTP lifecycle.
"""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.schemas import (
    DateComponent,
    ExtractDatePartParams,
    OperationType,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    extract_date_part,
    operation_summary,
)


@pytest.fixture
def sample_dates_df() -> pd.DataFrame:
    """Fixture providing timestamps for datetime component extraction verification."""
    return pd.DataFrame(
        {
            "id": [1, 2, 3],
            "timestamp": [
                "2026-03-15 14:30:00",
                "2025-11-20 08:15:00",
                "2024-01-01 00:00:00",
            ],
        }
    )


class TestExtractDatePartComponents:
    """Test suite for extracting individual temporal components."""

    def test_extract_year_and_month(self, sample_dates_df: pd.DataFrame):
        """Verify year and month extraction creates correctly named output columns."""
        res_year = extract_date_part(sample_dates_df, column="timestamp", component="year")
        assert "timestamp_year" in res_year.columns
        assert res_year["timestamp_year"].tolist() == [2026, 2025, 2024]

        res_month = extract_date_part(sample_dates_df, column="timestamp", component="month")
        assert "timestamp_month" in res_month.columns
        assert res_month["timestamp_month"].tolist() == [3, 11, 1]

    def test_extract_day_and_hour(self, sample_dates_df: pd.DataFrame):
        """Verify day of month and hour extraction."""
        res_day = extract_date_part(sample_dates_df, column="timestamp", component="day")
        assert res_day["timestamp_day"].tolist() == [15, 20, 1]

        res_hour = extract_date_part(sample_dates_df, column="timestamp", component="hour")
        assert res_hour["timestamp_hour"].tolist() == [14, 8, 0]

    def test_extract_day_of_week_and_quarter(self, sample_dates_df: pd.DataFrame):
        """Verify day of week (0=Monday) and calendar quarter (1-4) extraction."""
        # 2026-03-15 is Sunday -> 6
        # 2025-11-20 is Thursday -> 3
        # 2024-01-01 is Monday -> 0
        res_dow = extract_date_part(sample_dates_df, column="timestamp", component="day_of_week")
        assert res_dow["timestamp_day_of_week"].tolist() == [6, 3, 0]

        res_quarter = extract_date_part(sample_dates_df, column="timestamp", component="quarter")
        assert res_quarter["timestamp_quarter"].tolist() == [1, 4, 1]

    def test_custom_output_column(self, sample_dates_df: pd.DataFrame):
        """Verify explicit output_column is respected."""
        result = extract_date_part(
            sample_dates_df,
            column="timestamp",
            component="year",
            output_column="order_year",
        )
        assert "order_year" in result.columns
        assert result["order_year"].iloc[0] == 2026

    def test_preserves_missing_and_nat_dates(self):
        """Verify NaT / null dates yield NaN without raising errors."""
        df = pd.DataFrame({"dt": ["2026-05-10", None, "invalid", "2026-08-20"]})
        result = extract_date_part(df, column="dt", component="month", output_column="month_val")
        assert result["month_val"].iloc[0] == 5
        assert pd.isna(result["month_val"].iloc[1])
        assert pd.isna(result["month_val"].iloc[2])
        assert result["month_val"].iloc[3] == 8


class TestGuardrailsAndEdgeCases:
    """Test suite for safety constraints, input validation, and structural boundaries."""

    def test_missing_column_raises_error(self, sample_dates_df: pd.DataFrame):
        """Verify non-existent column raises TransformationError."""
        with pytest.raises(TransformationError, match="Column 'non_existent' not found"):
            extract_date_part(sample_dates_df, column="non_existent")

    def test_unknown_component_raises_error(self, sample_dates_df: pd.DataFrame):
        """Verify invalid component raises TransformationError."""
        with pytest.raises(TransformationError, match="Unknown date component"):
            extract_date_part(sample_dates_df, column="timestamp", component="decade")

    def test_unparseable_date_column_raises_error(self):
        """Verify column with invalid date strings raises TransformationError."""
        df = pd.DataFrame({"text": ["apple", "banana", "cherry"]})
        with pytest.raises(TransformationError, match="could not be parsed as datetime"):
            extract_date_part(df, column="text", component="year")

    def test_numeric_and_bool_columns_rejected(self):
        """Verify integer and boolean columns are rejected from datetime extraction."""
        df = pd.DataFrame({"num": [1, 2, 3], "flag": [True, False, True]})
        with pytest.raises(TransformationError, match="numeric or boolean"):
            extract_date_part(df, column="num", component="year")
        with pytest.raises(TransformationError, match="numeric or boolean"):
            extract_date_part(df, column="flag", component="year")

    def test_extracted_column_has_nullable_int64_dtype(self):
        """Verify output column uses Int64 nullable integer dtype."""
        df = pd.DataFrame({"dt": ["2026-05-10", None, "invalid"]})
        result = extract_date_part(df, column="dt", component="year")
        assert str(result["dt_year"].dtype) == "Int64"

    def test_output_column_collision_rejected(self, sample_dates_df: pd.DataFrame):
        """Verify output_column collision raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            extract_date_part(sample_dates_df, column="timestamp", component="year", output_column="id")

    def test_output_column_same_as_input_column_allowed(self, sample_dates_df: pd.DataFrame):
        """Verify explicit in-place replacement using input column name succeeds."""
        res = extract_date_part(sample_dates_df, column="timestamp", component="year", output_column="timestamp")
        assert res["timestamp"].tolist() == [2026, 2025, 2024]

    def test_empty_dataframe_schema_deterministic(self):
        """Verify empty DataFrame returns deterministic schema with target column added."""
        df = pd.DataFrame({"dt": pd.Series([], dtype=str)})
        result = extract_date_part(df, column="dt", component="year")
        assert "dt_year" in result.columns
        assert len(result) == 0

    def test_pydantic_schema_validation(self):
        """Verify Pydantic schema validation."""
        params = ExtractDatePartParams(column="timestamp", component=DateComponent.quarter)
        assert params.column == "timestamp"
        assert params.component == DateComponent.quarter


class TestPipelineAndHttpLifecycle:
    """Test suite for pipeline registry integration and HTTP lifecycle."""

    def test_transformation_registry_spec(self):
        """Verify extractDatePart registry spec is configured as reusable."""
        spec = TRANSFORMATION_REGISTRY.get(OperationType.extractDatePart)
        assert spec is not None
        assert spec.func == "extract_date_part"
        assert spec.reusable is True

        payload = {"extract_date_part_params": {"column": "ts", "component": "year", "output_column": "yr"}}
        args = spec.build_args(payload)
        assert args == ("ts", "year", "yr")

    def test_pipeline_replay_apply_logged_transformation(self, sample_dates_df: pd.DataFrame):
        """Verify apply_logged_transformation re-applies component extraction cleanly."""
        details = {"extract_date_part_params": {"column": "timestamp", "component": "year"}}
        result = apply_logged_transformation(sample_dates_df, OperationType.extractDatePart, details)
        assert "timestamp_year" in result.columns
        assert result["timestamp_year"].iloc[0] == 2026

    def test_operation_summary_formatting(self):
        """Verify operation_summary outputs clean human-readable parameter summary."""
        details = {"extract_date_part_params": {"column": "created_at", "component": "month"}}
        summary = operation_summary(OperationType.extractDatePart, details)
        assert "column: created_at" in summary
        assert "component: month" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Verify full HTTP lifecycle: preview mode, commit persistence, undo, and redo."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_content = "id,order_date\n1,2026-04-10\n2,2025-12-25\n"
        files = {"file": ("orders.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {"projectName": "Dates Project", "projectDescription": "Date extraction test"}
        upload_resp = client.post("/projects/upload", files=files, data=data)
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        transform_payload = {
            "operation_type": "extractDatePart",
            "extract_date_part_params": {
                "column": "order_date",
                "component": "year",
                "output_column": "order_year",
            },
        }

        # Step 1: Preview mode (uncommitted)
        preview_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": "true"},
            json=transform_payload,
        )
        assert preview_resp.status_code == 200
        yr_idx = preview_resp.json()["columns"].index("order_year")
        assert preview_resp.json()["rows"][0][yr_idx] == 2026
        assert preview_resp.json()["rows"][1][yr_idx] == 2025

        # Step 2: Verify project remains uncommitted
        get_uncommitted = client.get(f"/projects/get/{project_id}")
        assert "order_year" not in get_uncommitted.json()["columns"]

        # Step 3: Commit transformation
        commit_resp = client.post(f"/projects/{project_id}/transform", json=transform_payload)
        assert commit_resp.status_code == 200
        get_committed = client.get(f"/projects/get/{project_id}")
        assert "order_year" in get_committed.json()["columns"]

        # Step 4: Undo transformation
        undo_resp = client.post(f"/projects/{project_id}/undo")
        assert undo_resp.status_code == 200
        get_undone = client.get(f"/projects/get/{project_id}")
        assert "order_year" not in get_undone.json()["columns"]

        # Step 5: Redo transformation
        redo_resp = client.post(f"/projects/{project_id}/redo")
        assert redo_resp.status_code == 200
        get_redone = client.get(f"/projects/get/{project_id}")
        assert "order_year" in get_redone.json()["columns"]
