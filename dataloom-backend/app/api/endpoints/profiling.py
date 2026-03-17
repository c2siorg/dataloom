"""Profiling API endpoint for computing dataset statistics."""

import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.schemas import ProfileResponse
from app.services.profiling_service import compute_profile
from app.utils.pandas_helpers import read_csv_safe

router = APIRouter()


@router.get("/{project_id}/profile", response_model=ProfileResponse)
async def get_project_profile(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Compute and return the statistical profile for a project's dataset."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)
    return compute_profile(df)
