"""Merge/Join API endpoints for combining datasets across projects."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.services.merge_service import concat_datasets, merge_datasets
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe

logger = get_logger(__name__)

router = APIRouter()


class MergeRequest(BaseModel):
    """Request body for merge/join operations."""

    right_project_id: uuid.UUID
    how: str = "inner"
    left_on: str | None = None
    right_on: str | None = None
    on: str | None = None


class ConcatRequest(BaseModel):
    """Request body for concatenation operations."""

    project_ids: list[uuid.UUID]
    axis: int = 0


@router.post("/{project_id}/merge")
async def merge_projects(
    project_id: uuid.UUID,
    request: MergeRequest,
    db: Session = Depends(database.get_db),
):
    """Merge current project with another project using SQL-style joins."""
    left_project = get_project_or_404(project_id, db)
    right_project = get_project_or_404(request.right_project_id, db)

    left_df = read_csv_safe(left_project.file_path)
    right_df = read_csv_safe(right_project.file_path)

    try:
        result = merge_datasets(
            left_df,
            right_df,
            how=request.how,
            left_on=request.left_on,
            right_on=request.right_on,
            on=request.on,
        )
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    resp = dataframe_to_response(result)
    return {
        "project_id": project_id,
        "operation_type": "merge",
        "merge_type": request.how,
        **resp,
    }


@router.post("/{project_id}/concat")
async def concat_projects(
    project_id: uuid.UUID,
    request: ConcatRequest,
    db: Session = Depends(database.get_db),
):
    """Concatenate multiple project datasets together."""
    all_ids = [project_id] + request.project_ids
    dfs = []
    for pid in all_ids:
        project = get_project_or_404(pid, db)
        dfs.append(read_csv_safe(project.file_path))

    try:
        result = concat_datasets(dfs, axis=request.axis)
    except TransformationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    resp = dataframe_to_response(result)
    return {
        "project_id": project_id,
        "operation_type": "concat",
        **resp,
    }
