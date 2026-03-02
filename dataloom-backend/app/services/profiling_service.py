"""Service for computing statistical profiles of pandas DataFrames."""

import pandas as pd

from app.schemas import (
    CategoricalStatsSchema,
    ColumnProfileSchema,
    DatasetSummarySchema,
    FrequentValueSchema,
    NumericStatsSchema,
    ProfileResponse,
)


def classify_column(series: pd.Series) -> str:
    """Classify a column as 'numeric', 'categorical', 'datetime', or 'boolean'.

    Checks boolean first since bool is also considered numeric by pandas.
    """
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    return "categorical"


def compute_dataset_summary(df: pd.DataFrame) -> DatasetSummarySchema:
    """Compute dataset-level metrics: row count, column count, missing count,
    memory usage, duplicate row count."""
    return DatasetSummarySchema(
        row_count=len(df),
        column_count=len(df.columns),
        missing_count=int(df.isnull().sum().sum()),
        memory_usage_bytes=int(df.memory_usage(deep=True).sum()),
        duplicate_row_count=int(df.duplicated().sum()),
    )


def compute_numeric_stats(series: pd.Series) -> NumericStatsSchema | None:
    """Compute mean, median, std, min, max, Q1, Q3, skewness for a numeric column.

    Returns None if the column is entirely missing values.
    """
    if series.dropna().empty:
        return None

    series.describe()
    quartiles = series.quantile([0.25, 0.75])

    return NumericStatsSchema(
        mean=float(series.mean()),
        median=float(series.median()),
        std=float(series.std()),
        min=float(series.min()),
        max=float(series.max()),
        q1=float(quartiles[0.25]),
        q3=float(quartiles[0.75]),
        skewness=float(series.skew()),
    )


def compute_categorical_stats(series: pd.Series) -> CategoricalStatsSchema | None:
    """Compute top 5 frequent values with counts and mode for a categorical column.

    Returns None if the column is entirely missing values.
    """
    if series.dropna().empty:
        return None

    top = series.value_counts().head(5)
    top_values = [
        FrequentValueSchema(value=str(val), count=int(cnt))
        for val, cnt in top.items()
    ]

    mode_result = series.mode()
    mode = str(mode_result.iloc[0]) if len(mode_result) > 0 else None

    return CategoricalStatsSchema(top_values=top_values, mode=mode)


def compute_column_profile(name: str, series: pd.Series) -> ColumnProfileSchema:
    """Compute the full profile for a single column."""
    dtype = classify_column(series)
    missing_count = int(series.isnull().sum())
    total = len(series)
    missing_percentage = (missing_count / total) * 100 if total > 0 else 0.0
    unique_count = int(series.nunique())

    numeric_stats = None
    categorical_stats = None

    if dtype == "numeric":
        numeric_stats = compute_numeric_stats(series)
    elif dtype == "categorical":
        categorical_stats = compute_categorical_stats(series)

    return ColumnProfileSchema(
        name=name,
        dtype=dtype,
        missing_count=missing_count,
        missing_percentage=missing_percentage,
        unique_count=unique_count,
        numeric_stats=numeric_stats,
        categorical_stats=categorical_stats,
    )


def compute_profile(df: pd.DataFrame) -> ProfileResponse:
    """Compute the full dataset profile: summary + all column profiles."""
    summary = compute_dataset_summary(df)
    columns = [
        compute_column_profile(col, df[col]) for col in df.columns
    ]
    return ProfileResponse(summary=summary, columns=columns)
