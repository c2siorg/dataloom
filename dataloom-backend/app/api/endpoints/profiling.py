"""Data profiling endpoint — column statistics and quality scoring."""

import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.utils.logging import get_logger
from app.utils.pandas_helpers import (
    compute_quality_score,
    get_column_profile,
    read_file_safe,
)

logger = get_logger(__name__)
router = APIRouter()


@router.get("/{project_id}/profile")
async def get_dataset_profile(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Return a column-level statistical profile for a project's dataset.

    Response includes per-column dtype, null stats, unique count, and
    numeric distribution. Also returns a composite data quality score
    that penalises null values and duplicate rows.

    Args:
        project_id: UUID of the project to profile.

    Returns:
        JSON with total_rows, total_columns, duplicate_rows,
        quality_score (0-100), and per-column statistics.
    """
    project = get_project_or_404(project_id, db)
    df = read_file_safe(project.file_path)

    duplicate_rows = int(df.duplicated().sum())
    quality_score = compute_quality_score(df)
    columns = get_column_profile(df)

    logger.info(
        "Profile generated: project=%s rows=%d cols=%d quality=%.1f",
        project_id,
        len(df),
        len(df.columns),
        quality_score,
    )

    return {
        "project_id": str(project_id),
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "duplicate_rows": duplicate_rows,
        "quality_score": quality_score,
        "columns": columns,
    }