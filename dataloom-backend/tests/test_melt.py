import pandas as pd
import pytest

from app.schemas import MeltParams
from app.services.transformation_service import TransformationError, melt_dataframe


@pytest.fixture
def sample_df():
    return pd.DataFrame({"ID": [1, 2], "Name": ["Alice", "Bob"], "Math": [90, 80], "Science": [85, 88]})


def test_basic_melt(sample_df):
    params = MeltParams(id_vars=["ID", "Name"], value_vars=["Math", "Science"], var_name="Subject", value_name="Score")
    result = melt_dataframe(sample_df, params)

    assert len(result) == 4
    assert "Subject" in result.columns
    assert "Score" in result.columns


def test_melt_without_value_vars(sample_df):
    params = MeltParams(id_vars=["ID", "Name"], var_name="Category", value_name="Points")
    result = melt_dataframe(sample_df, params)

    assert len(result) == 4
    assert "Category" in result.columns
    assert "Points" in result.columns


def test_melt_overlap_raises(sample_df):
    params = MeltParams(id_vars=["ID"], value_vars=["ID", "Math"])

    with pytest.raises(TransformationError, match="cannot be both"):
        melt_dataframe(sample_df, params)


def test_melt_missing_column_raises(sample_df):
    params = MeltParams(id_vars=["MissingCol"], value_vars=["Math"])

    with pytest.raises(TransformationError, match="not found in dataset"):
        melt_dataframe(sample_df, params)


def test_melt_conflict_with_target_name_raises(sample_df):
    params = MeltParams(id_vars=["ID", "Math"], value_vars=["Science"], var_name="Math")

    with pytest.raises(TransformationError, match="conflicts with an id_var"):
        melt_dataframe(sample_df, params)
