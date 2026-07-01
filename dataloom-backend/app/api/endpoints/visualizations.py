"""Data visualization API endpoints.

Two read-only routes over a project's current working copy: auto-suggested charts
and a single configurable chart. Both return the self-describing ``ChartSpec``
shape (see ``schemas.ChartSpec``) — the backend aggregates, the frontend renders.

Column names are query parameters rather than path segments, matching the
profiling endpoints, so names with slashes or other reserved characters route
reliably across servers and proxies.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app import models, schemas
from app.api.dependencies import get_project_or_404, load_project_df
from app.services import visualization_service

router = APIRouter()


@router.get("/{project_id}/charts/suggest", response_model=schemas.ChartSuggestionsResponse)
async def suggest_charts(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return up to three charts recommended from the dataset's column shapes."""
    df = load_project_df(project)
    return {"suggestions": visualization_service.suggest_charts(df)}


@router.get("/{project_id}/charts", response_model=schemas.ChartSpec)
async def get_chart(
    project_id: uuid.UUID,
    chart_type: schemas.ChartType = Query(..., description="The kind of chart to build"),
    column: str | None = Query(None, description="Numeric column for a histogram"),
    category: str | None = Query(None, description="Grouping column for a bar/pie chart"),
    value: str | None = Query(None, description="Numeric value column for a bar/pie chart"),
    x: str | None = Query(None, description="X-axis column for a line/area/scatter chart"),
    y: list[str] = Query(default_factory=list, description="Y-axis column(s) for a line/area/scatter chart"),
    color: str | None = Query(None, description="Optional color-grouping column for a scatter chart"),
    agg: schemas.AggFunc = Query(schemas.AggFunc.sum, description="Aggregation for a bar chart"),
    bins: int = Query(visualization_service.DEFAULT_BINS, description="Bucket count for a histogram"),
    project: models.Project = Depends(get_project_or_404),
):
    """Build one chart from the project's dataset.

    Required parameters depend on ``chart_type``: histogram needs ``column``;
    bar/pie need ``category``; line/area/scatter need ``x`` and ``y``. Invalid
    combinations (missing params, or a column whose dtype the chart can't use)
    return 400; an unknown column returns 404.
    """
    df = load_project_df(project)
    try:
        return _dispatch(df, chart_type, column, category, value, x, y, color, agg, bins)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Column '{e.args[0]}' not found") from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


def _dispatch(df, chart_type, column, category, value, x, y, color, agg, bins):
    """Route a chart request to the matching service builder, validating params."""
    if chart_type == schemas.ChartType.histogram:
        if not column:
            raise ValueError("histogram requires 'column'")
        return visualization_service.build_histogram(df, column, bins)

    if chart_type == schemas.ChartType.bar:
        if not category:
            raise ValueError("bar chart requires 'category'")
        return visualization_service.build_bar_chart(df, category, value, agg.value)

    if chart_type == schemas.ChartType.pie:
        if not category:
            raise ValueError("pie chart requires 'category'")
        return visualization_service.build_pie_chart(df, category, value)

    if chart_type in (schemas.ChartType.line, schemas.ChartType.area):
        if not x or not y:
            raise ValueError(f"{chart_type.value} chart requires 'x' and at least one 'y'")
        if chart_type == schemas.ChartType.line:
            return visualization_service.build_line_chart(df, x, y)
        return visualization_service.build_area_chart(df, x, y)

    # scatter
    if not x or len(y) != 1:
        raise ValueError("scatter chart requires 'x' and exactly one 'y'")
    return visualization_service.build_scatter_plot(df, x, y[0], color)
