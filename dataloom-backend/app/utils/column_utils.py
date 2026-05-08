"""Utility functions for detecting and working with column types."""

import pandas as pd


def detect_column_types(df: pd.DataFrame) -> dict[str, str]:
    """Detect the semantic type of each column in a DataFrame.

    Uses dtype information for numeric and boolean columns, and
    heuristic date detection for object (string) columns.

    Args:
        df: The DataFrame to analyze.

    Returns:
        A dict mapping column name to type string:
        "integer", "float", "boolean", "date", or "string".
    """
    column_types = {}

    for col in df.columns:
        dtype = df[col].dtype

        if pd.api.types.is_integer_dtype(dtype):
            column_types[col] = "integer"
        elif pd.api.types.is_float_dtype(dtype):
            column_types[col] = "float"
        elif pd.api.types.is_bool_dtype(dtype):
            column_types[col] = "boolean"
        else:
            # Heuristic date detection for object/string columns
            sample = df[col].dropna().head(10)

            if len(sample) > 0:
                parsed = pd.to_datetime(sample, errors="coerce")
                success_ratio = parsed.notna().mean()

                if success_ratio >= 0.8:
                    column_types[col] = "date"
                else:
                    column_types[col] = "string"
            else:
                column_types[col] = "string"

    return column_types
