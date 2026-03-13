"""Tests for the dropNa path in apply_logged_transformation."""

import pandas as pd
import pytest

from app.services.transformation_service import apply_logged_transformation


@pytest.fixture
def df_with_nans():
    return pd.DataFrame({"a": [1.0, None, 3.0], "b": ["x", "y", None]})


class TestApplyLoggedDropNa:
    def test_drop_na_params_is_none(self, df_with_nans):
        action_details = {"drop_na_params": None}
        result = apply_logged_transformation(df_with_nans, "dropNa", action_details)
        assert len(result) == 1
        assert result.iloc[0]["a"] == 1.0

    def test_drop_na_params_key_absent(self, df_with_nans):
        action_details = {}
        result = apply_logged_transformation(df_with_nans, "dropNa", action_details)
        assert len(result) == 1
        assert result.iloc[0]["a"] == 1.0

    def test_drop_na_params_with_columns(self, df_with_nans):
        action_details = {"drop_na_params": {"columns": ["a"]}}
        result = apply_logged_transformation(df_with_nans, "dropNa", action_details)
        assert len(result) == 2
        assert list(result["a"]) == [1.0, 3.0]

    def test_drop_na_params_invalid_type_raises(self, df_with_nans):
        action_details = {"drop_na_params": "invalid"}
        with pytest.raises(ValueError, match="must be None or a dict"):
            apply_logged_transformation(df_with_nans, "dropNa", action_details)
