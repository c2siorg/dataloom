"""Project Report endpoint: download a PDF of the Sections the user chose."""

import re

from fastapi import APIRouter, Depends, Query, Response
from sqlmodel import Session

from app import database, models
from app.api.dependencies import get_project_or_404, load_project_df
from app.schemas import ReportSection
from app.services import profiling_service, project_service, quality_service, report_service
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


def _quality_settings_line() -> str:
    """Name the detector settings the report used.

    Read off the service's own defaults rather than restated as prose, so the
    page cannot claim settings the assessment did not use. The report always
    assesses with defaults, so a score tuned on screen may differ from this one.
    """
    return (
        "Assessed with default settings: IQR outlier detection at "
        f"{quality_service.DEFAULT_IQR_SENSITIVITY:g}× fence, no pattern rules."
    )


def _attachment_filename(project_name: str) -> str:
    safe = re.sub(r"[^\w.\-]", "_", project_name).strip("_") or "project"
    return f"{safe}_report.pdf"


@router.get("/{project_id}/report")
def download_report(
    section: list[ReportSection] = Query(default=list(ReportSection)),
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
):
    """Generate and download a PDF Report of the project.

    The Report is built on demand from the current working copy; nothing is
    persisted. ``section`` selects which Sections it carries — the dataset
    overview always prints, so a request that names no other section still
    yields a document.
    """
    df = load_project_df(project)
    chosen = set(section)

    summary = profiling_service.dataset_summary(df)
    profiles = profiling_service.all_column_profiles(df)["profiles"] if ReportSection.profiles in chosen else None
    quality = quality_service.assess_quality(df) if ReportSection.quality in chosen else None
    provenance = (
        project_service.collect_provenance(db, project.project_id) if ReportSection.provenance in chosen else None
    )

    pdf_bytes = report_service.build_report(
        project.name,
        summary,
        profiles=profiles,
        quality=quality,
        quality_settings=_quality_settings_line(),
        provenance=provenance,
    )
    logger.info(
        "Generated report for project=%s sections=%s (%d bytes)",
        project.project_id,
        sorted(s.value for s in chosen),
        len(pdf_bytes),
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_attachment_filename(project.name)}"'},
    )
