"""Service for computing chart-ready data from pandas DataFrames."""

import pandas as pd
from typing import Optional


def get_column_info(df: pd.DataFrame) -> list[dict]:
    """Return column names and inferred types for the chart axis pickers."""
    cols = []
    for col in df.columns:
        if pd.api.types.is_bool_dtype(df[col]):
            dtype = "boolean"
        elif pd.api.types.is_numeric_dtype(df[col]):
            dtype = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            dtype = "datetime"
        else:
            dtype = "categorical"
        cols.append({"name": col, "dtype": dtype})
    return cols


def compute_chart_data(
    df: pd.DataFrame,
    chart_type: str,
    x_column: str,
    y_column: Optional[str] = None,
    group_by: Optional[str] = None,
    agg_function: str = "mean",
    limit: int = 50,
) -> dict:
    """Compute aggregated data suitable for charting.

    Supports: bar, line, scatter, histogram, pie.
    """
    if x_column not in df.columns:
        raise ValueError(f"Column '{x_column}' not found")
    if y_column and y_column not in df.columns:
        raise ValueError(f"Column '{y_column}' not found")
    if group_by and group_by not in df.columns:
        raise ValueError(f"Column '{group_by}' not found")

    if chart_type == "histogram":
        return _compute_histogram(df, x_column, limit)
    elif chart_type == "pie":
        return _compute_pie(df, x_column, limit)
    elif chart_type == "scatter":
        return _compute_scatter(df, x_column, y_column, group_by, limit)
    else:
        # bar, line
        return _compute_aggregated(df, chart_type, x_column, y_column, group_by, agg_function, limit)


def _compute_histogram(df: pd.DataFrame, column: str, limit: int) -> dict:
    """Compute histogram bins for a column."""
    series = df[column].dropna()

    if pd.api.types.is_numeric_dtype(series):
        bins = min(limit, 30)
        counts, edges = pd.cut(series, bins=bins, retbins=True)
        value_counts = counts.value_counts().sort_index()
        data = []
        for interval, count in value_counts.items():
            data.append({
                "bin": f"{interval.left:.1f}-{interval.right:.1f}",
                "count": int(count),
            })
    else:
        value_counts = series.value_counts().head(limit)
        data = [{"bin": str(val), "count": int(cnt)} for val, cnt in value_counts.items()]

    return {"chart_type": "histogram", "data": data, "x_column": column}


def _compute_pie(df: pd.DataFrame, column: str, limit: int) -> dict:
    """Compute value counts for a pie chart."""
    top = df[column].dropna().value_counts().head(limit)
    total = top.sum()
    data = []
    for val, cnt in top.items():
        data.append({
            "name": str(val),
            "value": int(cnt),
            "percentage": round((cnt / total) * 100, 1) if total > 0 else 0,
        })
    return {"chart_type": "pie", "data": data, "x_column": column}


def _compute_scatter(df: pd.DataFrame, x_col: str, y_col: Optional[str], group_by: Optional[str], limit: int) -> dict:
    """Compute scatter plot points."""
    if not y_col:
        raise ValueError("Scatter plot requires both X and Y columns")

    subset = df[[x_col, y_col] + ([group_by] if group_by else [])].dropna().head(limit * 10)

    if group_by:
        groups = {}
        for grp_name, grp_df in subset.groupby(group_by):
            points = grp_df.head(limit)
            groups[str(grp_name)] = [
                {"x": _safe_val(row[x_col]), "y": _safe_val(row[y_col])}
                for _, row in points.iterrows()
            ]
        return {"chart_type": "scatter", "data": groups, "x_column": x_col, "y_column": y_col, "grouped": True}
    else:
        points = subset.head(limit * 5)
        data = [
            {"x": _safe_val(row[x_col]), "y": _safe_val(row[y_col])}
            for _, row in points.iterrows()
        ]
        return {"chart_type": "scatter", "data": data, "x_column": x_col, "y_column": y_col, "grouped": False}


def _compute_aggregated(
    df: pd.DataFrame, chart_type: str, x_col: str, y_col: Optional[str],
    group_by: Optional[str], agg_function: str, limit: int,
) -> dict:
    """Compute aggregated bar/line chart data."""
    if not y_col:
        # Count-based: just count occurrences of x values
        counts = df[x_col].value_counts().head(limit)
        data = [{"x": str(val), "y": int(cnt)} for val, cnt in counts.items()]
        return {"chart_type": chart_type, "data": data, "x_column": x_col, "y_column": "count"}

    agg_map = {"mean": "mean", "sum": "sum", "count": "count", "min": "min", "max": "max", "median": "median"}
    agg_fn = agg_map.get(agg_function, "mean")

    if group_by:
        grouped = df.groupby([x_col, group_by])[y_col].agg(agg_fn).reset_index()
        pivot = grouped.pivot(index=x_col, columns=group_by, values=y_col).head(limit)
        data = []
        for idx_val in pivot.index:
            row = {"x": str(idx_val)}
            for col in pivot.columns:
                val = pivot.loc[idx_val, col]
                row[str(col)] = _safe_val(val)
            data.append(row)
        series_names = [str(c) for c in pivot.columns]
        return {"chart_type": chart_type, "data": data, "x_column": x_col, "y_column": y_col, "series": series_names}
    else:
        grouped = df.groupby(x_col)[y_col].agg(agg_fn).head(limit).reset_index()
        data = [{"x": str(row[x_col]), "y": _safe_val(row[y_col])} for _, row in grouped.iterrows()]
        return {"chart_type": chart_type, "data": data, "x_column": x_col, "y_column": y_col}


def _safe_val(val):
    """Convert pandas values to JSON-safe Python types."""
    if pd.isna(val):
        return None
    if isinstance(val, (int,)):
        return int(val)
    if isinstance(val, (float,)):
        return round(float(val), 4)
    return str(val)
