"""Pure functions for appending one dataset onto another.

Each function takes DataFrames and returns plain data or a new DataFrame.
No side effects — file I/O is handled by the endpoint layer. This mirrors
``transformation_service``'s style.
"""

import pandas as pd

from app.utils.pandas_helpers import map_dtype


def append_dataframes(df: pd.DataFrame, new_df: pd.DataFrame) -> pd.DataFrame:
    """Stack ``new_df``'s rows below ``df``, unioning columns.

    Columns present in only one frame are kept and filled with NaN for the
    other frame's rows. Column order is ``df``'s columns first, then any new
    columns in their order of appearance in ``new_df``.

    Args:
        df: The project's current DataFrame.
        new_df: The incoming file's DataFrame.

    Returns:
        The combined DataFrame with a fresh RangeIndex.
    """
    return pd.concat([df, new_df], join="outer", ignore_index=True, sort=False)


def analyze_append(df: pd.DataFrame, new_df: pd.DataFrame) -> dict:
    """Describe how ``new_df`` would align with ``df`` on append.

    Args:
        df: The project's current DataFrame.
        new_df: The incoming file's DataFrame.

    Returns:
        Dict with matched/new/missing column lists, dtype clashes among the
        matched columns, and both row counts. Dtypes use the same simplified
        names the table UI shows (``map_dtype``).
    """
    matched_columns = [col for col in df.columns if col in new_df.columns]
    new_columns = [col for col in new_df.columns if col not in df.columns]
    missing_columns = [col for col in df.columns if col not in new_df.columns]

    dtype_clashes = []
    for col in matched_columns:
        existing_dtype = map_dtype(df[col].dtype)
        incoming_dtype = map_dtype(new_df[col].dtype)
        if existing_dtype != incoming_dtype:
            dtype_clashes.append(
                {
                    "column": col,
                    "existing_dtype": existing_dtype,
                    "incoming_dtype": incoming_dtype,
                }
            )

    return {
        "matched_columns": matched_columns,
        "new_columns": new_columns,
        "missing_columns": missing_columns,
        "dtype_clashes": dtype_clashes,
        "current_row_count": len(df),
        "incoming_row_count": len(new_df),
    }
