"""Export API endpoints for CSV format customization."""

import uuid
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from app import database, schemas
from app.api.dependencies import get_project_or_404
from app.services.file_service import export_csv_with_format
from app.utils.logging import get_logger

logger = get_logger(__name__)

router = APIRouter()


@router.get("/csv/{project_id}")
async def export_project_csv(
    project_id: uuid.UUID,
    delimiter: schemas.DelimiterType = Query(schemas.DelimiterType.comma, description="CSV delimiter type"),
    include_header: bool = Query(True, description="Include header row"),
    encoding: schemas.EncodingType = Query(schemas.EncodingType.utf_8, description="Text encoding"),
    db: Session = Depends(database.get_db),
):
    """Export project CSV with customizable format options.
    
    Allows users to specify delimiter, header inclusion, and text encoding
    for the exported CSV file.
    """
    logger.info(
        "Export request: project_id=%s, delimiter=%s, header=%s, encoding=%s",
        project_id, delimiter.value, include_header, encoding.value
    )
    
    project = get_project_or_404(project_id, db)
    
    export_params = schemas.ExportParameters(
        delimiter=delimiter,
        include_header=include_header,
        encoding=encoding
    )
    
    def generate_csv():
        """Generator function for streaming CSV content."""
        return export_csv_with_format(project.file_path, export_params)
    
    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"}
    )