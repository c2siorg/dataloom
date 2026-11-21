"""Comprehensive unit, boundary, and HTTP semantics tests for categorical encoding.

Covers encoding algorithms (One-Hot dummy expansion, Label/Ordinal integer mapping,
and Relative Frequency encoding), guardrails (max_categories cardinality ceilings,
column name collision prevention), missing value preservation, empty/null edge cases,
pipeline reusability, and transactional undo/redo lifecycles.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas import (
    EncodeCategoricalParams,
    EncodingMethod,
    OperationType,
)
from app.services.transformation_service import (
    TRANSFORMATION_REGISTRY,
    TransformationError,
    apply_logged_transformation,
    encode_categorical,
    operation_summary,
)


@pytest.fixture
def sample_categorical_df():
    """Sample DataFrame with diverse categories, duplicates, and missing values."""
    data = {
        "id": [1, 2, 3, 4, 5, 6],
        "tier": ["Gold", "Silver", "Bronze", "Silver", "Gold", "Bronze"],
        "status": ["Active", "Pending", "Active", "Active", None, "Pending"],
        "amount": [100.0, 200.0, 150.0, 300.0, 250.0, 180.0],
    }
    return pd.DataFrame(data)


class TestOneHotEncoding:
    """Tests for One-Hot dummy indicator expansion and collinearity controls."""

    def test_one_hot_basic_expansion(self, sample_categorical_df):
        """One-hot encoding replaces source column with binary indicator columns for each category."""
        result = encode_categorical(sample_categorical_df, column="tier", method="one_hot")

        # Original column is replaced by distinct dummy columns (sorted alphabetically: Bronze, Gold, Silver)
        assert "tier" not in result.columns
        assert "tier_Bronze" in result.columns
        assert "tier_Gold" in result.columns
        assert "tier_Silver" in result.columns

        # Verify correct row activations
        # Row 0 was "Gold": tier_Gold must be 1, others 0
        assert result.loc[0, "tier_Gold"] == 1
        assert result.loc[0, "tier_Silver"] == 0
        assert result.loc[0, "tier_Bronze"] == 0

        # Row 2 was "Bronze"
        assert result.loc[2, "tier_Bronze"] == 1
        assert result.loc[2, "tier_Gold"] == 0

    def test_one_hot_drop_first(self, sample_categorical_df):
        """drop_first=True omits the first category to prevent multicollinearity in regressions."""
        result = encode_categorical(sample_categorical_df, column="tier", method="one_hot", drop_first=True)

        # "Bronze" is first alphabetically, so it should be omitted
        assert "tier_Bronze" not in result.columns
        assert "tier_Gold" in result.columns
        assert "tier_Silver" in result.columns
        assert len(result.columns) == len(sample_categorical_df.columns) - 1 + 2

    def test_one_hot_custom_prefix(self, sample_categorical_df):
        """Custom prefix overrides the default column name prefix."""
        result = encode_categorical(sample_categorical_df, column="tier", method="one_hot", prefix="vip")

        assert "vip_Bronze" in result.columns
        assert "vip_Gold" in result.columns
        assert "vip_Silver" in result.columns

    def test_one_hot_preserves_nan_as_all_zeros(self, sample_categorical_df):
        """Rows with NaN categories have 0 in all generated category indicator columns."""
        result = encode_categorical(sample_categorical_df, column="status", method="one_hot")

        # Row 4 has status=None: all dummy indicators must be 0
        assert result.loc[4, "status_Active"] == 0
        assert result.loc[4, "status_Pending"] == 0

    def test_one_hot_column_collision_rejected(self, sample_categorical_df):
        """Raises TransformationError if generated dummy column name already exists in DataFrame."""
        df = sample_categorical_df.copy()
        df["tier_Gold"] = 999.0  # Colliding column already exists
        with pytest.raises(TransformationError, match="already exist in DataFrame"):
            encode_categorical(df, column="tier", method="one_hot")

    def test_one_hot_output_column_rejected(self, sample_categorical_df):
        """Raises TransformationError if output_column is provided for one_hot encoding."""
        with pytest.raises(TransformationError, match="output_column cannot be specified"):
            encode_categorical(sample_categorical_df, column="tier", method="one_hot", output_column="custom")

    def test_one_hot_single_category_drop_first(self):
        """Single category column with drop_first=True drops column and produces 0 dummy columns."""
        df = pd.DataFrame({"tier": ["Gold", "Gold", "Gold"], "num": [1, 2, 3]})
        result = encode_categorical(df, column="tier", method="one_hot", drop_first=True)
        assert "tier" not in result.columns
        assert "tier_Gold" not in result.columns
        assert list(result.columns) == ["num"]


class TestLabelAndFrequencyEncoding:
    """Tests for Label (ordinal) and Relative Frequency encoding algorithms."""

    def test_label_encoding_inplace(self, sample_categorical_df):
        """Label encoding maps distinct categories to sequential float integers in-place."""
        result = encode_categorical(sample_categorical_df, column="tier", method="label")

        # Alphabetical sort: Bronze -> 0.0, Gold -> 1.0, Silver -> 2.0
        assert result.loc[0, "tier"] == 1.0  # Gold
        assert result.loc[1, "tier"] == 2.0  # Silver
        assert result.loc[2, "tier"] == 0.0  # Bronze
        assert result.loc[3, "tier"] == 2.0  # Silver
        assert len(result.columns) == len(sample_categorical_df.columns)

    def test_label_encoding_new_column(self, sample_categorical_df):
        """When output_column is provided, source column is preserved and new encoded column added."""
        result = encode_categorical(sample_categorical_df, column="tier", method="label", output_column="tier_encoded")

        # Original column preserved intact
        assert result["tier"].equals(sample_categorical_df["tier"])
        # New encoded column appended
        assert "tier_encoded" in result.columns
        assert result.loc[0, "tier_encoded"] == 1.0
        assert result.loc[2, "tier_encoded"] == 0.0

    def test_label_encoding_preserves_nan(self, sample_categorical_df):
        """Label encoding preserves NaN values without creating a numeric label for nulls."""
        result = encode_categorical(sample_categorical_df, column="status", method="label")

        assert pd.isna(result.loc[4, "status"])
        assert result["status"].isna().sum() == 1

    def test_frequency_encoding_inplace(self, sample_categorical_df):
        """Frequency encoding maps categories to their empirical proportion (count / N)."""
        result = encode_categorical(sample_categorical_df, column="tier", method="frequency")

        # Total 6 rows: Bronze=2 (2/6 = 0.3333...), Gold=2 (2/6), Silver=2 (2/6)
        assert np.isclose(result.loc[0, "tier"], 2.0 / 6.0)
        assert np.isclose(result.loc[1, "tier"], 2.0 / 6.0)

    def test_frequency_encoding_new_column_with_missing(self, sample_categorical_df):
        """Frequency encoding calculates proportions from non-null total and preserves nulls."""
        result = encode_categorical(
            sample_categorical_df, column="status", method="frequency", output_column="status_freq"
        )

        # Total non-null status rows: 5 (Active=3, Pending=2, None=1)
        # Active -> 3/5 = 0.6, Pending -> 2/5 = 0.4
        assert np.isclose(result.loc[0, "status_freq"], 0.6)
        assert np.isclose(result.loc[1, "status_freq"], 0.4)
        assert pd.isna(result.loc[4, "status_freq"])

    def test_output_column_same_as_input_column_allowed(self, sample_categorical_df):
        """Explicit in-place replacement using input column name succeeds for label and frequency."""
        lbl_res = encode_categorical(sample_categorical_df, column="tier", method="label", output_column="tier")
        assert lbl_res.loc[0, "tier"] == 1.0

        freq_res = encode_categorical(sample_categorical_df, column="tier", method="frequency", output_column="tier")
        assert np.isclose(freq_res.loc[0, "tier"], 2.0 / 6.0)


class TestGuardrailsAndEdgeCases:
    """Cardinary ceilings, type safety, empty samples, and invalid parameter guardrails."""

    def test_missing_column_raises_error(self, sample_categorical_df):
        """Nonexistent column name raises TransformationError with available columns."""
        with pytest.raises(TransformationError, match="Column 'unknown' not found"):
            encode_categorical(sample_categorical_df, column="unknown")

    def test_max_categories_cardinality_ceiling_rejected(self):
        """Columns exceeding max_categories raise TransformationError to prevent explosion."""
        df = pd.DataFrame({"high_cardinality": [f"user_{i}" for i in range(60)]})
        with pytest.raises(TransformationError, match="safety limit of 50"):
            encode_categorical(df, column="high_cardinality", max_categories=50)

    def test_invalid_method_raises_error(self, sample_categorical_df):
        """Unknown encoding method raises TransformationError."""
        with pytest.raises(TransformationError, match="Unknown encoding method"):
            encode_categorical(sample_categorical_df, column="tier", method="hash_trick")

    def test_empty_dataframe_deterministic_schema(self):
        """Empty DataFrame (0 rows) returns cleanly without schema corruption."""
        df = pd.DataFrame({"cat": pd.Series([], dtype=str)})
        result = encode_categorical(df, column="cat", method="one_hot")
        assert len(result) == 0

    def test_empty_dataframe_deterministic_schema_with_output_column(self):
        """Empty DataFrame with output_column adds column to schema deterministically."""
        df = pd.DataFrame({"cat": pd.Series([], dtype=str)})
        result = encode_categorical(df, column="cat", method="label", output_column="cat_lbl")
        assert "cat_lbl" in result.columns
        assert len(result) == 0

    def test_all_null_column_deterministic_schema(self):
        """Column containing only NaNs returns with float NaN type deterministically."""
        df = pd.DataFrame({"cat": [None, np.nan, None]})
        result = encode_categorical(df, column="cat", method="label", output_column="cat_lbl")
        assert len(result) == 3
        assert result["cat_lbl"].isna().all()
        assert pd.api.types.is_float_dtype(result["cat_lbl"])

    def test_whitespace_in_column_name_trimmed(self, sample_categorical_df):
        """Leading/trailing whitespace in column name is gracefully trimmed."""
        result = encode_categorical(sample_categorical_df, column="  tier  ", method="label")
        assert result.loc[0, "tier"] == 1.0

    def test_output_column_collision_rejected_for_label(self, sample_categorical_df):
        """Output column collision for label encoding raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists in DataFrame"):
            encode_categorical(sample_categorical_df, column="tier", method="label", output_column="amount")

    def test_output_column_whitespace_collision_rejected_for_label(self, sample_categorical_df):
        """Output column collision via whitespace for label encoding raises TransformationError."""
        with pytest.raises(TransformationError, match="already exists in DataFrame"):
            encode_categorical(sample_categorical_df, column="tier", method="label", output_column="  amount  ")

    def test_pydantic_schema_validation(self):
        """Pydantic model EncodeCategoricalParams enforces field constraints."""
        params = EncodeCategoricalParams(column="tier", method=EncodingMethod.one_hot, max_categories=100)
        assert params.max_categories == 100

        # Invalid max_categories (must be > 0 and <= 500)
        with pytest.raises(ValidationError):
            EncodeCategoricalParams(column="tier", max_categories=0)

        with pytest.raises(ValidationError):
            EncodeCategoricalParams(column="tier", max_categories=1000)

        # output_column not allowed for one_hot
        with pytest.raises(ValidationError, match="output_column cannot be specified"):
            EncodeCategoricalParams(column="tier", method=EncodingMethod.one_hot, output_column="custom")


class TestPipelineAndHttpLifecycle:
    """Registry compliance, pipeline reusability, summary generation, and API endpoint integration."""

    def test_transformation_registry_spec(self):
        """encodeCategorical is registered in TRANSFORMATION_REGISTRY and marked reusable for pipelines."""
        spec = TRANSFORMATION_REGISTRY[OperationType.encodeCategorical]
        assert spec.func == "encode_categorical"
        assert spec.label == "Encode categorical variables"
        assert spec.params_field == "encode_categorical_params"
        assert spec.reusable is True

    def test_pipeline_replay_apply_logged_transformation(self, sample_categorical_df):
        """Pipeline replay via apply_logged_transformation applies encodeCategorical correctly."""
        details = {
            "encode_categorical_params": {
                "column": "tier",
                "method": "label",
            }
        }
        replayed_df = apply_logged_transformation(sample_categorical_df, OperationType.encodeCategorical, details)
        assert replayed_df.loc[0, "tier"] == 1.0
        assert replayed_df.loc[2, "tier"] == 0.0

    def test_operation_summary_formatting(self):
        """operation_summary renders a clean, human-readable summary of parameters."""
        details = {
            "encode_categorical_params": {
                "column": "department",
                "method": "one_hot",
                "drop_first": True,
            }
        }
        summary = operation_summary(OperationType.encodeCategorical, details)
        assert "column: department" in summary
        assert "method: one_hot" in summary

    def test_http_transform_endpoint_preview_and_commit(self, client, monkeypatch):
        """HTTP /projects/{id}/transform executes encodeCategorical in preview, commit, undo, and redo modes."""
        monkeypatch.setattr("os.fsync", lambda fd: None)
        csv_data = "id,color\n1,Red\n2,Blue\n3,Red\n4,Green\n"
        upload_res = client.post(
            "/projects/upload",
            files={"file": ("encoding_test.csv", csv_data.encode("utf-8"), "text/csv")},
            data={"projectName": "Encoding API Test", "projectDescription": "Test fixture"},
        )
        assert upload_res.status_code == 200
        proj_id = upload_res.json()["project_id"]

        # 1. Preview mode (preview=true)
        prev_payload = {
            "operation_type": "encodeCategorical",
            "encode_categorical_params": {
                "column": "color",
                "method": "label",
            },
        }
        prev_res = client.post(f"/projects/{proj_id}/transform", params={"preview": "true"}, json=prev_payload)
        assert prev_res.status_code == 200
        prev_data = prev_res.json()
        assert prev_data["total_rows"] == 4
        # Blue -> 0.0, Green -> 1.0, Red -> 2.0
        color_idx = prev_data["columns"].index("color")
        prev_colors = [row[color_idx] for row in prev_data["rows"]]
        assert np.allclose(prev_colors, [2.0, 0.0, 2.0, 1.0])

        # Confirm underlying file remains uncommitted (still string "Red", "Blue")
        curr = client.get(f"/projects/get/{proj_id}").json()
        curr_colors = [row[curr["columns"].index("color")] for row in curr["rows"]]
        assert curr_colors == ["Red", "Blue", "Red", "Green"]

        # 2. Commit mode (default preview=false)
        commit_res = client.post(f"/projects/{proj_id}/transform", json=prev_payload)
        assert commit_res.status_code == 200
        commit_data = commit_res.json()
        committed_colors = [row[commit_data["columns"].index("color")] for row in commit_data["rows"]]
        assert np.allclose(committed_colors, [2.0, 0.0, 2.0, 1.0])

        # Confirm persisted file reflects committed transformation
        after_commit = client.get(f"/projects/get/{proj_id}").json()
        after_colors = [row[after_commit["columns"].index("color")] for row in after_commit["rows"]]
        assert np.allclose(after_colors, [2.0, 0.0, 2.0, 1.0])

        # 3. Undo lifecycle: restores original string values
        undo_res = client.post(f"/projects/{proj_id}/undo")
        assert undo_res.status_code == 200
        undone = client.get(f"/projects/get/{proj_id}").json()
        undone_colors = [row[undone["columns"].index("color")] for row in undone["rows"]]
        assert undone_colors == ["Red", "Blue", "Red", "Green"]

        # 4. Redo lifecycle: re-applies encoded integer values
        redo_res = client.post(f"/projects/{proj_id}/redo")
        assert redo_res.status_code == 200
        redone = client.get(f"/projects/get/{proj_id}").json()
        redone_colors = [row[redone["columns"].index("color")] for row in redone["rows"]]
        assert np.allclose(redone_colors, [2.0, 0.0, 2.0, 1.0])
