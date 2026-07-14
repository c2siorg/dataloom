"""Data quality assessment API endpoint.

A single on-demand route: POST runs the detectors over the project's current
working copy and returns the scored report. Nothing is persisted — the
assessment is a pure computation (POST only because the detector configuration
travels in the body). Detection logic lives in ``quality_service``; this layer
only handles I/O.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app import models, schemas
from app.api.dependencies import get_project_or_404, load_project_df
from app.services import quality_service

router = APIRouter()


# Sync on purpose: the assessment is CPU-bound pandas/regex work (including
# user-supplied patterns), so FastAPI must run it in the threadpool rather than
# on the event loop.
@router.post("/{project_id}/quality", response_model=schemas.QualityReportResponse)
def run_quality_assessment(
    project_id: uuid.UUID,
    request: schemas.QualityAssessRequest | None = None,
    project: models.Project = Depends(get_project_or_404),
):
    """Run a quality assessment on the working copy and return the scored report."""
    config = request or schemas.QualityAssessRequest()
    df = load_project_df(project)
    try:
        return quality_service.assess_quality(
            df,
            rules=[rule.model_dump() for rule in config.pattern_rules],
            outlier_method=config.outlier_method.value,
            outlier_sensitivity=config.outlier_sensitivity,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
