import pandas as pd

from app.services.transformation_service import TransformationError


def merge_datasets(
    left_df: pd.DataFrame,
    right_df: pd.DataFrame,
    how: str = "inner",
    left_on: str | None = None,
    right_on: str | None = None,
    on: str | None = None,
) -> pd.DataFrame:
    valid_joins = {"inner", "left", "right", "outer", "cross"}
    if how not in valid_joins:
        raise TransformationError(f"Unsupported join type: {how}. Use one of {valid_joins}")

    if how == "cross":
        return pd.merge(left_df, right_df, how="cross")

    if on:
        cols = [c.strip() for c in on.split(",")]
        missing_left = [c for c in cols if c not in left_df.columns]
        missing_right = [c for c in cols if c not in right_df.columns]
        if missing_left:
            raise TransformationError(f"Columns {missing_left} not found in left dataset")
        if missing_right:
            raise TransformationError(f"Columns {missing_right} not found in right dataset")
        return pd.merge(left_df, right_df, how=how, on=cols)

    if not left_on or not right_on:
        raise TransformationError("Specify 'on' for common columns, or both 'left_on' and 'right_on'")

    left_cols = [c.strip() for c in left_on.split(",")]
    right_cols = [c.strip() for c in right_on.split(",")]

    missing_left = [c for c in left_cols if c not in left_df.columns]
    missing_right = [c for c in right_cols if c not in right_df.columns]
    if missing_left:
        raise TransformationError(f"Columns {missing_left} not found in left dataset")
    if missing_right:
        raise TransformationError(f"Columns {missing_right} not found in right dataset")

    return pd.merge(left_df, right_df, how=how, left_on=left_cols, right_on=right_cols)


def concat_datasets(
    dfs: list[pd.DataFrame],
    axis: int = 0,
    ignore_index: bool = True,
) -> pd.DataFrame:
    if len(dfs) < 2:
        raise TransformationError("Need at least 2 datasets to concatenate")
    return pd.concat(dfs, axis=axis, ignore_index=ignore_index)
