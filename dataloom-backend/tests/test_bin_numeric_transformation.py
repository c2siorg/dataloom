"""Tests for the numeric binning and discretization transformation (binNumeric).

Verifies equal width, equal frequency (quantile), and custom threshold binning,
along with guardrails, NaN preservation, custom labeling, pipeline replay,
and transactional HTTP preview, commit, undo, and redo lifecycles.
"""

import io

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.schemas import (
    BinningMethod,
    BinNumericParams,
    OperationType,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    bin_numeric,
    operation_summary,
)


@pytest.fixture
def sample_numeric_df() -> pd.DataFrame:
    """Fixture providing a deterministic numeric dataset for discretization testing."""
    return pd.DataFrame(
        {
            "id": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
            "score": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0],
            "category": ["A", "B", "A", "B", "C", "A", "C", "B", "A", "C"],
        }
    )


class TestEqualWidthBinning:
    """Test suite for uniform interval (equal-width) discretization."""

    def test_equal_width_basic_interval_strings(self, sample_numeric_df: pd.DataFrame):
        """Verify that default equal-width binning divides numeric values into interval strings."""
        result = bin_numeric(sample_numeric_df, column="score", method="equal_width", bins=4)

        # In-place binning replaces score column with interval representations
        assert "score" in result.columns
        assert len(result) == 10
        # All non-null rows must have non-empty string intervals
        assert all(isinstance(v, str) and len(v) > 0 for v in result["score"])
        # Check that smallest value (10.0) and largest value (100.0) fall in respective intervals
        first_bin = result["score"].iloc[0]
        last_bin = result["score"].iloc[-1]
        assert first_bin != last_bin

    def test_equal_width_custom_labels(self, sample_numeric_df: pd.DataFrame):
        """Verify that equal-width binning assigns user-provided descriptive labels."""
        labels = ["Low", "MidLow", "MidHigh", "High"]
        result = bin_numeric(
            sample_numeric_df,
            column="score",
            method="equal_width",
            bins=4,
            labels=labels,
        )

        assert result["score"].iloc[0] == "Low"
        assert result["score"].iloc[1] == "Low"
        assert result["score"].iloc[9] == "High"
        assert set(result["score"].unique()) == set(labels)

    def test_equal_width_new_output_column(self, sample_numeric_df: pd.DataFrame):
        """Verify that specifying output_column preserves original numeric column intact."""
        labels = ["Q1", "Q2"]
        result = bin_numeric(
            sample_numeric_df,
            column="score",
            method="equal_width",
            bins=2,
            labels=labels,
            output_column="score_binned",
        )

        # Original score column preserved with original numeric float values
        assert "score_binned" in result.columns
        assert result["score"].iloc[0] == 10.0
        assert result["score_binned"].iloc[0] == "Q1"
        assert result["score_binned"].iloc[-1] == "Q2"

    def test_equal_width_preserves_missing_values(self):
        """Verify that NaN / null values remain None/NaN and are not assigned to any bin."""
        df = pd.DataFrame({"val": [10.0, float("nan"), 30.0, None, 50.0]})
        result = bin_numeric(df, column="val", method="equal_width", bins=2, labels=["Low", "High"])

        assert result["val"].iloc[0] == "Low"
        assert pd.isna(result["val"].iloc[1])
        assert result["val"].iloc[2] == "Low"
        assert pd.isna(result["val"].iloc[3])
        assert result["val"].iloc[4] == "High"

    def test_equal_width_constant_column(self):
        """Verify constant columns (min == max) are placed cleanly in a single bucket without zero division."""
        df = pd.DataFrame({"constant": [42.0, 42.0, 42.0, float("nan")]})
        result = bin_numeric(df, column="constant", method="equal_width", bins=3, labels=["Fixed", "B", "C"])

        assert result["constant"].iloc[0] == "Fixed"
        assert result["constant"].iloc[1] == "Fixed"
        assert result["constant"].iloc[2] == "Fixed"
        assert pd.isna(result["constant"].iloc[3])


class TestEqualFrequencyBinning:
    """Test suite for sample quantile (equal-frequency) discretization."""

    def test_equal_frequency_basic_quantiles(self, sample_numeric_df: pd.DataFrame):
        """Verify equal frequency divides observations into quantiles with balanced counts."""
        result = bin_numeric(
            sample_numeric_df,
            column="score",
            method="equal_frequency",
            bins=2,
            labels=["Bottom_Half", "Top_Half"],
        )

        counts = result["score"].value_counts()
        assert counts["Bottom_Half"] == 5
        assert counts["Top_Half"] == 5

    def test_equal_frequency_duplicate_edges_handled(self):
        """Verify duplicate quantile edges (e.g. repeated values) do not crash discretization."""
        df = pd.DataFrame({"repeated": [0.0, 0.0, 0.0, 0.0, 10.0, 20.0, 30.0, 40.0]})
        result = bin_numeric(df, column="repeated", method="equal_frequency", bins=4)

        assert len(result) == 8
        assert all(pd.notna(v) for v in result["repeated"])

    def test_equal_frequency_duplicate_edges_with_labels_raises_error(self):
        """Verify tied quantile values with explicit labels raise informative TransformationError."""
        df = pd.DataFrame({"repeated": [0.0, 0.0, 0.0, 0.0, 10.0, 20.0, 30.0, 40.0]})
        with pytest.raises(TransformationError, match="duplicate quantile boundaries"):
            bin_numeric(df, column="repeated", method="equal_frequency", bins=4, labels=["A", "B", "C", "D"])


class TestCustomEdgeBinning:
    """Test suite for explicit threshold boundary binning."""

    def test_custom_edges_with_explicit_labels(self):
        """Verify custom edge cuts categorize values strictly into boundary intervals."""
        df = pd.DataFrame({"age": [5, 17, 18, 25, 45, 64, 75, 80]})
        edges = [0.0, 18.0, 65.0, 100.0]
        labels = ["Minor", "Adult", "Senior"]

        result = bin_numeric(
            df,
            column="age",
            method="custom",
            custom_edges=edges,
            labels=labels,
            include_lowest=True,
            right=True,
        )

        assert result["age"].iloc[0] == "Minor"
        assert result["age"].iloc[1] == "Minor"
        assert result["age"].iloc[2] == "Minor"
        assert result["age"].iloc[3] == "Adult"
        assert result["age"].iloc[4] == "Adult"
        assert result["age"].iloc[5] == "Adult"
        assert result["age"].iloc[6] == "Senior"
        assert result["age"].iloc[7] == "Senior"

    def test_custom_edges_out_of_bounds_values_are_null(self):
        """Verify values outside explicit custom boundaries are assigned None without raising error."""
        df = pd.DataFrame({"val": [-10.0, 5.0, 15.0, 50.0, 120.0]})
        edges = [0.0, 20.0, 100.0]
        result = bin_numeric(df, column="val", method="custom", custom_edges=edges, labels=["Low", "High"])

        assert result["val"].iloc[0] is None  # -10 < 0
        assert result["val"].iloc[1] == "Low"
        assert result["val"].iloc[2] == "Low"
        assert result["val"].iloc[3] == "High"
        assert result["val"].iloc[4] is None  # 120 > 100


class TestGuardrailsAndEdgeCases:
    """Test suite for safety constraints, input validation, and structural boundaries."""

    def test_missing_column_raises_error(self, sample_numeric_df: pd.DataFrame):
        """Verify referencing a non-existent column raises TransformationError."""
        with pytest.raises(TransformationError, match="Column 'non_existent' not found"):
            bin_numeric(sample_numeric_df, column="non_existent")

    def test_boolean_column_rejected(self):
        """Verify boolean column is rejected because bool is an invalid continuous candidate."""
        df = pd.DataFrame({"flag": [True, False, True]})
        with pytest.raises(TransformationError, match="is boolean"):
            bin_numeric(df, column="flag")

    def test_non_numeric_string_column_rejected(self):
        """Verify non-numeric text column is rejected with informative error."""
        df = pd.DataFrame({"text": ["apple", "banana", "cherry"]})
        with pytest.raises(TransformationError, match="is not numeric"):
            bin_numeric(df, column="text")

    def test_unknown_method_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify unsupported binning method raises TransformationError."""
        with pytest.raises(TransformationError, match="Unknown binning method"):
            bin_numeric(sample_numeric_df, column="score", method="unsupported_method")

    def test_custom_edges_not_monotonically_increasing(self, sample_numeric_df: pd.DataFrame):
        """Verify unordered custom edges raise TransformationError."""
        with pytest.raises(TransformationError, match="monotonically increasing"):
            bin_numeric(sample_numeric_df, column="score", method="custom", custom_edges=[100.0, 50.0, 10.0])

    def test_custom_edges_fewer_than_two_boundaries(self, sample_numeric_df: pd.DataFrame):
        """Verify custom_edges with fewer than 2 points raises TransformationError."""
        with pytest.raises(TransformationError, match="at least 2 boundary values"):
            bin_numeric(sample_numeric_df, column="score", method="custom", custom_edges=[50.0])

    def test_labels_count_mismatch_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify label count not matching bin count raises TransformationError."""
        with pytest.raises(TransformationError, match="Number of labels"):
            bin_numeric(sample_numeric_df, column="score", method="equal_width", bins=3, labels=["A", "B"])

    def test_output_column_collision_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify attempting to overwrite an existing column as output_column raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists"):
            bin_numeric(sample_numeric_df, column="score", output_column="category")

    def test_output_column_whitespace_collision_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify output column colliding with existing column via whitespace is rejected."""
        with pytest.raises(TransformationError, match="already exists"):
            bin_numeric(sample_numeric_df, column="score", output_column="  category  ")

    def test_output_column_same_as_input_column_allowed(self, sample_numeric_df: pd.DataFrame):
        """Verify explicit in-place replacement using input column name succeeds."""
        result = bin_numeric(sample_numeric_df, column="score", bins=2, output_column="score")
        assert "score" in result.columns
        assert len(result) == 10

    def test_invalid_custom_edges_on_all_null_column_raises(self):
        """Verify invalid custom edges on an all-null column raises TransformationError upfront."""
        df = pd.DataFrame({"empty": [None, None, float("nan")]})
        with pytest.raises(TransformationError, match="custom_edges must contain at least 2 boundary values"):
            bin_numeric(df, column="empty", method="custom", custom_edges=[10.0])

    def test_invalid_labels_count_on_all_null_column_raises(self):
        """Verify mismatched labels count on an all-null column raises TransformationError upfront."""
        df = pd.DataFrame({"empty": [None, None, float("nan")]})
        with pytest.raises(TransformationError, match="Number of labels"):
            bin_numeric(df, column="empty", method="equal_width", bins=3, labels=["OnlyOne"])

    def test_whitespace_in_column_name_in_place_replace(self):
        """Verify output_column equal to stripped input column replaces in place."""
        df = pd.DataFrame({"  score  ": [10.0, 50.0, 100.0]})
        result = bin_numeric(df, column="score", method="equal_width", bins=2, output_column="score")
        assert list(result.columns) == ["  score  "]
        assert len(result) == 3

    def test_custom_edges_with_non_custom_method_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify providing custom_edges with non-custom binning method raises TransformationError."""
        with pytest.raises(TransformationError, match="custom_edges can only be specified"):
            bin_numeric(sample_numeric_df, column="score", method="equal_width", custom_edges=[0.0, 50.0, 100.0])

    def test_whitespace_output_column_rejected(self, sample_numeric_df: pd.DataFrame):
        """Verify blank or whitespace output_column is rejected."""
        with pytest.raises(TransformationError, match="output_column must not be empty"):
            bin_numeric(sample_numeric_df, column="score", output_column="   ")

    def test_column_name_whitespace_trimmed(self, sample_numeric_df: pd.DataFrame):
        """Verify leading and trailing whitespace in column name is trimmed cleanly."""
        result = bin_numeric(sample_numeric_df, column="  score  ", bins=2)
        assert "score" in result.columns

    def test_empty_dataframe_handled_safely(self):
        """Verify empty DataFrame preserves schema without raising exception."""
        df = pd.DataFrame({"score": pd.Series([], dtype=float)})
        result = bin_numeric(df, column="score", bins=3)
        assert "score" in result.columns
        assert len(result) == 0

    def test_empty_dataframe_schema_deterministic_with_output_column(self):
        """Verify empty DataFrame with output_column adds column to schema."""
        df = pd.DataFrame({"score": pd.Series([], dtype=float)})
        result = bin_numeric(df, column="score", bins=3, output_column="score_binned")
        assert "score_binned" in result.columns
        assert len(result) == 0

    def test_all_null_column_handled_safely(self):
        """Verify all-null column returns all nulls without raising ZeroDivisionError."""
        df = pd.DataFrame({"score": [float("nan"), None, float("nan")]})
        result = bin_numeric(df, column="score", bins=3)
        assert "score" in result.columns
        assert all(pd.isna(v) for v in result["score"])

    def test_pydantic_schema_validation(self):
        """Verify Pydantic schema validator enforces boundary consistency."""
        # Valid config
        params = BinNumericParams(
            column="score",
            method=BinningMethod.custom,
            custom_edges=[0.0, 50.0, 100.0],
            labels=["Low", "High"],
        )
        assert params.bins == 5

        # Unsorted edges rejected by schema validator
        with pytest.raises(ValueError, match="strictly monotonically increasing"):
            BinNumericParams(
                column="score",
                method=BinningMethod.custom,
                custom_edges=[100.0, 50.0, 0.0],
            )

        # Label count mismatch rejected by schema validator
        with pytest.raises(ValueError, match="must equal bins"):
            BinNumericParams(
                column="score",
                method=BinningMethod.equal_width,
                bins=4,
                labels=["A", "B"],
            )

        # custom_edges with non-custom method rejected by schema validator
        with pytest.raises(ValueError, match="custom_edges can only be specified when method is 'custom'"):
            BinNumericParams(
                column="score",
                method=BinningMethod.equal_width,
                custom_edges=[0.0, 50.0, 100.0],
            )


class TestPipelineAndHttpLifecycle:
    """Test suite for registry integration, pipeline serialization, and HTTP endpoints."""

    def test_transformation_registry_spec(self):
        """Verify binNumeric is properly registered with pipeline reusability."""
        spec = TRANSFORMATION_REGISTRY.get(OperationType.binNumeric)
        assert spec is not None
        assert spec.func == "bin_numeric"
        assert spec.params_field == "bin_numeric_params"
        assert spec.reusable is True

        payload = {
            "bin_numeric_params": {
                "column": "score",
                "method": "equal_width",
                "bins": 3,
                "labels": ["L", "M", "H"],
            }
        }
        args = spec.build_args(payload)
        assert args[0] == "score"
        assert args[1] == "equal_width"
        assert args[2] == 3
        assert args[4] == ["L", "M", "H"]

    def test_pipeline_replay_apply_logged_transformation(self, sample_numeric_df: pd.DataFrame):
        """Verify apply_logged_transformation re-applies binNumeric cleanly."""
        action_details = {
            "bin_numeric_params": {
                "column": "score",
                "method": "equal_width",
                "bins": 2,
                "labels": ["Low", "High"],
            }
        }
        result = apply_logged_transformation(sample_numeric_df, OperationType.binNumeric, action_details)
        assert result["score"].iloc[0] == "Low"
        assert result["score"].iloc[-1] == "High"

    def test_operation_summary_formatting(self):
        """Verify operation_summary formats binNumeric parameters as concise log entry."""
        details = {
            "bin_numeric_params": {
                "column": "score",
                "method": "equal_width",
                "bins": 4,
            }
        }
        summary = operation_summary(OperationType.binNumeric, details)
        assert "column: score" in summary
        assert "method: equal_width" in summary
        assert "bins: 4" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client: TestClient, monkeypatch: pytest.MonkeyPatch):
        """Verify full HTTP lifecycle: upload project, preview, commit, undo, and redo."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_content = "id,score\n1,10.0\n2,20.0\n3,30.0\n4,40.0\n5,50.0\n6,60.0\n7,70.0\n8,80.0\n9,90.0\n10,100.0\n"
        files = {"file": ("scores.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
        data = {"projectName": "Binning Project", "projectDescription": "Testing binning"}
        upload_resp = client.post("/projects/upload", files=files, data=data)
        assert upload_resp.status_code == 200
        project_id = upload_resp.json()["project_id"]

        transform_payload = {
            "operation_type": "binNumeric",
            "bin_numeric_params": {
                "column": "score",
                "method": "equal_width",
                "bins": 2,
                "labels": ["Bottom", "Top"],
                "output_column": "score_tier",
            },
        }

        # Step 1: Preview mode (uncommitted)
        preview_resp = client.post(
            f"/projects/{project_id}/transform",
            params={"preview": "true"},
            json=transform_payload,
        )
        assert preview_resp.status_code == 200
        preview_data = preview_resp.json()
        assert "score_tier" in preview_data["columns"]
        score_tier_idx = preview_data["columns"].index("score_tier")
        assert preview_data["rows"][0][score_tier_idx] == "Bottom"
        assert preview_data["rows"][-1][score_tier_idx] == "Top"

        # Step 2: Verify project remains uncommitted
        get_resp = client.get(f"/projects/get/{project_id}")
        assert get_resp.status_code == 200
        assert "score_tier" not in get_resp.json()["columns"]

        # Step 3: Commit transformation
        commit_resp = client.post(
            f"/projects/{project_id}/transform",
            json=transform_payload,
        )
        assert commit_resp.status_code == 200
        committed_data = commit_resp.json()
        assert "score_tier" in committed_data["columns"]
        tier_idx = committed_data["columns"].index("score_tier")
        assert committed_data["rows"][0][tier_idx] == "Bottom"
        assert committed_data["rows"][-1][tier_idx] == "Top"

        # Step 4: Verify persistent state
        get_persisted = client.get(f"/projects/get/{project_id}")
        assert get_persisted.status_code == 200
        assert "score_tier" in get_persisted.json()["columns"]

        # Step 5: Undo transformation
        undo_resp = client.post(f"/projects/{project_id}/undo")
        assert undo_resp.status_code == 200
        get_undone = client.get(f"/projects/get/{project_id}")
        assert "score_tier" not in get_undone.json()["columns"]

        # Step 6: Redo transformation
        redo_resp = client.post(f"/projects/{project_id}/redo")
        assert redo_resp.status_code == 200
        get_redone = client.get(f"/projects/get/{project_id}")
        assert "score_tier" in get_redone.json()["columns"]
        redone_tier_idx = get_redone.json()["columns"].index("score_tier")
        assert get_redone.json()["rows"][0][redone_tier_idx] == "Bottom"
        assert get_redone.json()["rows"][-1][redone_tier_idx] == "Top"
