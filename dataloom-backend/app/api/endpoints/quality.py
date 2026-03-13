"""Data quality assessment API endpoints."""

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.services.quality_service import apply_quality_fix, assess_quality
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe, save_csv_safe

logger = get_logger(__name__)

router = APIRouter()


@router.get("/{project_id}/quality")
async def get_quality_assessment(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Run data quality assessment on a project dataset."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)
    return assess_quality(df)


class QualityFixRequest(BaseModel):
    fix_type: str
    params: dict = {}


@router.post("/{project_id}/quality/fix")
async def apply_fix(
    project_id: uuid.UUID,
    request: QualityFixRequest,
    db: Session = Depends(database.get_db),
):
    """Apply a one-click quality fix to the project dataset."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    result = apply_quality_fix(df, request.fix_type, request.params)
    save_csv_safe(result, project.file_path)

    resp = dataframe_to_response(result)
    return {"project_id": project_id, "fix_type": request.fix_type, **resp}
