"""Data profiling API endpoints.

Three read-only routes over a project's current working copy: a dataset
summary, a per-column profile, and a numeric correlation matrix. All are
descriptive — quality assessment is out of scope here.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from app import models, schemas
from app.api.dependencies import get_project_or_404, load_project_df
from app.services import profiling_service

router = APIRouter()


@router.get("/{project_id}/profile/summary", response_model=schemas.DatasetSummaryResponse)
def get_dataset_summary(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return a top-level summary of the project's dataset."""
    df = load_project_df(project)
    return profiling_service.dataset_summary(df)


@router.get("/{project_id}/profile/column", response_model=schemas.ColumnProfileResponse)
def get_column_profile(
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
    df = load_project_df(project)
    try:
        return profiling_service.column_profile(df, column_name)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=f"Column '{column_name}' not found") from e


@router.get("/{project_id}/profile/columns", response_model=schemas.ColumnProfilesResponse)
def get_all_column_profiles(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return type-aware profiles for every column from a single dataset read.

    Batch equivalent of ``/profile/column`` for each column; preferred when the
    client needs all columns (e.g. the column-profiles table view) so the
    working copy is read once rather than once per column.
    """
    df = load_project_df(project)
    return profiling_service.all_column_profiles(df)


@router.get("/{project_id}/profile/correlation", response_model=schemas.CorrelationResponse)
def get_correlation_matrix(
    project_id: uuid.UUID,
    project: models.Project = Depends(get_project_or_404),
):
    """Return the pairwise Pearson correlation over numeric columns."""
    df = load_project_df(project)
    return profiling_service.correlation_matrix(df)
