"""Data quality assessment API endpoint."""

import uuid
from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.services.quality_engine import run_quality_assessment
from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_csv_safe

logger = get_logger(__name__)

router = APIRouter()


@router.post("/{project_id}/quality/profile")
async def profile_project(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Run a full quality assessment on a project's current working data.

    Returns the composite quality score, per-column profiles, duplicate and
    outlier reports, and ranked fix suggestions.
    """
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)
    report = run_quality_assessment(df)
    return asdict(report)
