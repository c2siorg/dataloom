"""Chart data API endpoints."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.services.chart_service import compute_chart_data, get_column_info
from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_csv_safe

logger = get_logger(__name__)

router = APIRouter()


@router.get("/{project_id}/chart/columns")
async def get_chart_columns(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Get available columns and their types for chart axis selection."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)
    return {"columns": get_column_info(df)}


@router.get("/{project_id}/chart/data")
async def get_chart_data(
    project_id: uuid.UUID,
    chart_type: str = Query(..., description="bar, line, scatter, histogram, pie"),
    x_column: str = Query(..., description="X-axis column"),
    y_column: str | None = Query(None, description="Y-axis column"),
    group_by: str | None = Query(None, description="Group-by column"),
    agg_function: str = Query("mean", description="Aggregation: mean, sum, count, min, max, median"),
    limit: int = Query(50, ge=1, le=500, description="Max data points"),
    db: Session = Depends(database.get_db),
):
    """Compute chart data for the given configuration."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    try:
        result = compute_chart_data(df, chart_type, x_column, y_column, group_by, agg_function, limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Chart computation error: %s", e)
        raise HTTPException(status_code=500, detail="Failed to compute chart data") from e

    return result
