"""Multi-format export and quality report API endpoints."""

import uuid

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app import database
from app.api.dependencies import get_project_or_404
from app.services.export_service import export_dataframe, generate_quality_report_html
from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_csv_safe

logger = get_logger(__name__)

router = APIRouter()


@router.get("/{project_id}/export")
async def export_project(
    project_id: uuid.UUID,
    fmt: str = Query("csv", description="Export format: csv, xlsx, json, parquet, tsv"),
    db: Session = Depends(database.get_db),
):
    """Export project data in the specified format."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    buf, filename, media_type = export_dataframe(df, fmt)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{project_id}/quality-report")
async def get_quality_report(
    project_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Generate and download an HTML quality report."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    html = generate_quality_report_html(df, project_name=project.name)

    return StreamingResponse(
        iter([html]),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename=quality_report_{project.name}.html"},
    )
