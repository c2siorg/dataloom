"""Visualization service: chart data over a DataFrame.

Pure functions, no side effects — each takes a DataFrame and returns a plain
``ChartSpec`` dict; the endpoint layer handles I/O. This mirrors
``profiling_service``'s style.

Design principle (from the proposal): the backend computes *aggregated* chart
data, the frontend renders it. No image generation here. Crucially, aggregation/
binning/sampling happens server-side over the full working copy, so the wire
payload stays small regardless of dataset size — the same chart request costs the
same whether the dataset has 1k or 1M rows.

Every builder returns the same ``ChartSpec`` shape so the frontend maps a single
``chart_type`` field to a renderer; adding a chart type is one builder here plus
one renderer case there, with no protocol change.

Conventions:
- Numeric output is JSON-safe: ``None`` in place of ``NaN``/``inf`` (reusing
  ``profiling_service``'s helpers), so values survive FastAPI serialization.
- A point's ``x`` is a category label (str), a rounded number, or an ISO date
  string; ``y`` is always a JSON-safe number.
"""

from typing import Any

import pandas as pd

from app.services.profiling_service import _round, _safe_number
from app.utils.pandas_helpers import map_dtype

# Default histogram bucket count when the caller does not specify one.
DEFAULT_BINS = 20
# Hard bounds on histogram bins (a slider in the UI maps onto this range).
MIN_BINS = 2
MAX_BINS = 100
# Scatter is sampled down to this many points before serializing.
MAX_SCATTER_POINTS = 3000
# Pie keeps this many slices; the rest collapse into a single "Other" slice.
MAX_PIE_SLICES = 12
# Bar keeps this many categories (highest values first); the rest are dropped.
MAX_BAR_CATEGORIES = 30
# Line/area downsample to this many points per series (evenly spaced).
MAX_LINE_POINTS = 2000
# A categorical column at or below this distinct-value count is "low cardinality".
LOW_CARDINALITY_MAX = 25

# Aggregation name (wire, matching schemas.AggFunc) → pandas Series/GroupBy method.
AGG_FUNCS = {
    "count": "size",
    "sum": "sum",
    "mean": "mean",
    "median": "median",
    "min": "min",
    "max": "max",
}

NUMERIC_LABELS = ("int", "float")


# --- internal helpers --------------------------------------------------------


def _spec(
    chart_type: str,
    title: str,
    x_label: str,
    y_label: str,
    series: list[dict[str, Any]],
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble a ChartSpec, dropping any None-valued meta keys."""
    spec: dict[str, Any] = {
        "chart_type": chart_type,
        "title": title,
        "x_label": x_label,
        "y_label": y_label,
        "series": series,
    }
    if meta:
        cleaned = {k: v for k, v in meta.items() if v is not None}
        if cleaned:
            spec["meta"] = cleaned
    return spec


def _require_column(df: pd.DataFrame, column: str) -> None:
    if column not in df.columns:
        raise KeyError(column)


def _require_numeric(df: pd.DataFrame, column: str) -> None:
    """Raise ValueError if a column is not numeric (int/float)."""
    if map_dtype(df[column].dtype) not in NUMERIC_LABELS:
        raise ValueError(f"Column '{column}' is not numeric")


def _fmt_edge(value: float) -> str:
    """Format a histogram bin edge compactly (drop trailing ``.0``)."""
    rounded = round(float(value), 2)
    return str(int(rounded)) if rounded == int(rounded) else str(rounded)


def _x_value(value: Any, label: str) -> Any:
    """Coerce a point's x to a JSON-safe scalar based on its column dtype."""
    if label == "datetime":
        ts = pd.Timestamp(value)
        return None if pd.isna(ts) else ts.isoformat()
    if label in NUMERIC_LABELS:
        return _round(value)
    return str(value)


# --- chart builders ----------------------------------------------------------


def build_histogram(df: pd.DataFrame, column: str, bins: int = DEFAULT_BINS) -> dict[str, Any]:
    """Bin a numeric column into a frequency distribution.

    Returns a single ``count`` series whose points carry a ``"left–right"`` bin
    label as x and the bin count as y. A constant column collapses to one bin.
    """
    _require_column(df, column)
    _require_numeric(df, column)
    bins = max(MIN_BINS, min(MAX_BINS, int(bins)))

    series = pd.to_numeric(df[column], errors="coerce").dropna()
    total = int(series.shape[0])
    if total == 0:
        return _spec("histogram", f"Distribution of {column}", column, "Count", [{"name": "count", "data": []}])

    low, high = float(series.min()), float(series.max())
    if low == high:
        data = [{"x": _fmt_edge(low), "y": total}]
        return _spec(
            "histogram",
            f"Distribution of {column}",
            column,
            "Count",
            [{"name": "count", "data": data}],
            {"bins": 1, "total_rows": total},
        )

    binned = pd.cut(series, bins=bins)
    counts = binned.value_counts(sort=False)
    data = [
        {"x": f"{_fmt_edge(interval.left)}–{_fmt_edge(interval.right)}", "y": int(count)}
        for interval, count in counts.items()
    ]
    return _spec(
        "histogram",
        f"Distribution of {column}",
        column,
        "Count",
        [{"name": "count", "data": data}],
        {"bins": bins, "total_rows": total},
    )


def build_bar_chart(
    df: pd.DataFrame,
    category_col: str,
    value_col: str | None = None,
    agg: str = "sum",
) -> dict[str, Any]:
    """Aggregate a numeric value over a categorical column.

    With ``agg="count"`` the value column is ignored and rows-per-category are
    counted. Categories are sorted by value descending and capped at
    ``MAX_BAR_CATEGORIES`` (``meta.truncated`` flags the cut).
    """
    _require_column(df, category_col)
    if agg not in AGG_FUNCS:
        raise ValueError(f"Unsupported aggregation '{agg}'")

    if agg == "count":
        grouped = df.groupby(category_col, dropna=True).size()
        y_label = "Count"
    else:
        if value_col is None:
            raise ValueError("value_col is required for non-count aggregations")
        _require_column(df, value_col)
        _require_numeric(df, value_col)
        values = pd.to_numeric(df[value_col], errors="coerce")
        grouped = values.groupby(df[category_col], dropna=True).agg(AGG_FUNCS[agg])
        y_label = f"{agg} of {value_col}"

    grouped = grouped.sort_values(ascending=False)
    truncated = grouped.shape[0] > MAX_BAR_CATEGORIES
    grouped = grouped.head(MAX_BAR_CATEGORIES)

    data = [{"x": str(label), "y": _safe_number(value)} for label, value in grouped.items()]
    name = "count" if agg == "count" else f"{agg}({value_col})"
    return _spec(
        "bar",
        f"{y_label} by {category_col}",
        category_col,
        y_label,
        [{"name": name, "data": data}],
        {"truncated": truncated or None},
    )


def _xy_series(df: pd.DataFrame, x_col: str, y_cols: list[str], chart_type: str) -> dict[str, Any]:
    """Shared builder for line/area: one series per y column, sorted by x."""
    _require_column(df, x_col)
    if not y_cols:
        raise ValueError("at least one y column is required")
    for y in y_cols:
        _require_column(df, y)
        _require_numeric(df, y)

    x_label = map_dtype(df[x_col].dtype)
    frame = df[[x_col, *y_cols]].dropna(subset=[x_col]).sort_values(x_col)

    sampled = False
    if frame.shape[0] > MAX_LINE_POINTS:
        step = frame.shape[0] // MAX_LINE_POINTS + 1
        frame = frame.iloc[::step]
        sampled = True

    xs = [_x_value(v, x_label) for v in frame[x_col]]
    series = [
        {"name": y, "data": [{"x": x, "y": _safe_number(v)} for x, v in zip(xs, frame[y], strict=True)]} for y in y_cols
    ]
    title = f"{', '.join(y_cols)} over {x_col}"
    return _spec(chart_type, title, x_col, ", ".join(y_cols), series, {"sampled": sampled or None})


def build_line_chart(df: pd.DataFrame, x_col: str, y_cols: list[str]) -> dict[str, Any]:
    """Plot one or more numeric series against an ordered (often datetime) x."""
    return _xy_series(df, x_col, y_cols, "line")


def build_area_chart(df: pd.DataFrame, x_col: str, y_cols: list[str]) -> dict[str, Any]:
    """Area variant of :func:`build_line_chart` (same data, filled rendering)."""
    return _xy_series(df, x_col, y_cols, "area")


def build_scatter_plot(
    df: pd.DataFrame,
    x_col: str,
    y_col: str,
    color_col: str | None = None,
    max_points: int = MAX_SCATTER_POINTS,
) -> dict[str, Any]:
    """Plot two numeric columns as a point cloud, optionally grouped by color.

    Rows missing x or y are dropped. The cloud is randomly sampled down to
    ``max_points`` (``meta.sampled`` flags it) so the payload stays bounded.
    """
    _require_column(df, x_col)
    _require_column(df, y_col)
    _require_numeric(df, x_col)
    _require_numeric(df, y_col)

    cols = [x_col, y_col] + ([color_col] if color_col else [])
    if color_col:
        _require_column(df, color_col)
    frame = df[cols].dropna(subset=[x_col, y_col])

    sampled = False
    if frame.shape[0] > max_points:
        frame = frame.sample(n=max_points, random_state=0)
        sampled = True

    if color_col:
        series = []
        for group_value, group in frame.groupby(color_col, dropna=True):
            data = [{"x": _round(xv), "y": _round(yv)} for xv, yv in zip(group[x_col], group[y_col], strict=True)]
            series.append({"name": str(group_value), "data": data})
    else:
        data = [{"x": _round(xv), "y": _round(yv)} for xv, yv in zip(frame[x_col], frame[y_col], strict=True)]
        series = [{"name": f"{y_col} vs {x_col}", "data": data}]

    return _spec("scatter", f"{y_col} vs {x_col}", x_col, y_col, series, {"sampled": sampled or None})


def build_pie_chart(
    df: pd.DataFrame,
    labels_col: str,
    values_col: str | None = None,
    max_slices: int = MAX_PIE_SLICES,
) -> dict[str, Any]:
    """Show category proportions as a single-series set of slices.

    With ``values_col`` omitted the slices are row counts per category; otherwise
    they are the summed value per category. Slices beyond ``max_slices`` collapse
    into a single ``"Other"`` slice (``meta.truncated`` flags it).
    """
    _require_column(df, labels_col)

    if values_col is None:
        counts = df[labels_col].value_counts(dropna=True)
        y_label = "Count"
    else:
        _require_column(df, values_col)
        _require_numeric(df, values_col)
        values = pd.to_numeric(df[values_col], errors="coerce")
        counts = values.groupby(df[labels_col], dropna=True).sum().sort_values(ascending=False)
        y_label = f"Sum of {values_col}"

    truncated = counts.shape[0] > max_slices
    data = [{"x": str(label), "y": _safe_number(value)} for label, value in counts.head(max_slices).items()]
    if truncated:
        other = _safe_number(counts.iloc[max_slices:].sum())
        data.append({"x": "Other", "y": other})

    return _spec(
        "pie",
        f"{y_label} by {labels_col}",
        labels_col,
        y_label,
        [{"name": labels_col, "data": data}],
        {"truncated": truncated or None},
    )


# --- auto-suggestions --------------------------------------------------------


def _classify_columns(df: pd.DataFrame) -> dict[str, list[str]]:
    """Group column names by chart-relevant kind."""
    kinds: dict[str, list[str]] = {"numeric": [], "categorical": [], "datetime": [], "low_card": []}
    for column in df.columns:
        label = map_dtype(df[column].dtype)
        name = str(column)
        if label in NUMERIC_LABELS:
            kinds["numeric"].append(name)
        elif label == "datetime":
            kinds["datetime"].append(name)
        elif label in ("str", "bool"):
            kinds["categorical"].append(name)
            if df[column].nunique(dropna=True) <= LOW_CARDINALITY_MAX:
                kinds["low_card"].append(name)
    return kinds


def _most_correlated_pair(df: pd.DataFrame, numeric: list[str]) -> tuple[str, str] | None:
    """Return the numeric column pair with the largest |Pearson r|, if any."""
    corr = df[numeric].corr(method="pearson").abs()
    best: tuple[str, str] | None = None
    best_r = -1.0
    for i in range(len(numeric)):
        for j in range(i + 1, len(numeric)):
            r = corr.iat[i, j]
            if pd.notna(r) and r > best_r:
                best_r = float(r)
                best = (numeric[i], numeric[j])
    return best


def suggest_charts(df: pd.DataFrame, limit: int = 3) -> list[dict[str, Any]]:
    """Recommend up to ``limit`` charts from the dataset's column shapes.

    The heuristic prefers, in order: a scatter of the two most-correlated numeric
    columns, a line over any datetime column, a bar of a low-cardinality category
    by a numeric value, a histogram of a numeric column, then a pie of a
    low-cardinality category. Returns ready-to-render ChartSpecs.
    """
    kinds = _classify_columns(df)
    numeric, datetime_cols, low_card = kinds["numeric"], kinds["datetime"], kinds["low_card"]
    suggestions: list[dict[str, Any]] = []

    if len(numeric) >= 2:
        pair = _most_correlated_pair(df, numeric)
        if pair:
            suggestions.append(build_scatter_plot(df, pair[0], pair[1]))

    if datetime_cols and numeric:
        suggestions.append(build_line_chart(df, datetime_cols[0], [numeric[0]]))

    if low_card and numeric:
        suggestions.append(build_bar_chart(df, low_card[0], numeric[0], agg="sum"))

    if numeric:
        suggestions.append(build_histogram(df, numeric[0]))

    if low_card:
        suggestions.append(build_pie_chart(df, low_card[0]))

    return suggestions[:limit]
