"""Data profiling API endpoints.

Three read-only routes over a project's current working copy: a dataset
summary, a per-column profile, and a numeric correlation matrix. All are
descriptive — quality assessment is out of scope here.
"""

import uuid

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from app import models, schemas
from app.api.dependencies import get_project_or_404
from app.services import profiling_service
from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_table_safe

logger = get_logger(__name__)

router = APIRouter()


def _load_project_df(project: models.Project) -> pd.DataFrame:
    """Read the project's working copy, redacting any path from error details.

    ``read_table_safe`` embeds the absolute file path in its 404/500 details;
    surface a generic message to the client instead, matching the transform
    endpoint's handling.
    """
    try:
        return read_table_safe(project.file_path)
    except HTTPException as e:
        if e.status_code == 404:
            raise HTTPException(status_code=404, detail="Project data file not found") from e
        logger.warning(
            "Failed to read project file for profiling project_id=%s status=%s", project.project_id, e.status_code
        )
        raise HTTPException(status_code=e.status_code, detail="Could not read project data") from e


@router.get("/{project_id}/profile/summary", response_model=schemas.DatasetSummaryResponse)
async def get_dataset_summary(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return a top-level summary of the project's dataset."""
    df = _load_project_df(project)
    return profiling_service.dataset_summary(df)


@router.get("/{project_id}/profile/column", response_model=schemas.ColumnProfileResponse)
async def get_column_profile(
    project_id: uuid.UUID,
    column_name: str = Query(..., description="Name of the column to profile"),
    project: models.Project = Depends(get_project_or_404),
):
    """Return a type-aware profile of a single column.

    The column name is taken as a query parameter rather than a path segment so
    that names containing slashes (or other reserved characters) route reliably
    across servers and reverse proxies, which handle ``%2F`` in paths
    inconsistently.
    """
    df = _load_project_df(project)
    try:
        return profiling_service.column_profile(df, column_name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found") from e


@router.get("/{project_id}/profile/columns", response_model=schemas.ColumnProfilesResponse)
async def get_all_column_profiles(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return type-aware profiles for every column from a single dataset read.

    Batch equivalent of ``/profile/column`` for each column; preferred when the
    client needs all columns (e.g. the column-profiles table view) so the
    working copy is read once rather than once per column.
    """
    df = _load_project_df(project)
    return profiling_service.all_column_profiles(df)


@router.get("/{project_id}/profile/correlation", response_model=schemas.CorrelationResponse)
async def get_correlation_matrix(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return the pairwise Pearson correlation over numeric columns."""
    df = _load_project_df(project)
    return profiling_service.correlation_matrix(df)
