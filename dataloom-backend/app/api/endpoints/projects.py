"""Project CRUD API endpoints.

Handles upload, retrieval, save (checkpoint), and revert operations.
"""

import io
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404
from app.services.file_service import delete_project_files, get_original_path, store_upload
from app.services.project_service import (
    create_checkpoint,
    create_project,
    delete_project,
    get_recent_projects,
)
from app.services.transformation_service import apply_logged_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_as_strings, read_csv_safe, save_csv_safe
from app.utils.security import validate_upload_file

logger = get_logger(__name__)

router = APIRouter()


@router.post("/upload", response_model=schemas.ProjectResponse)
async def upload_project(
    file: UploadFile = File(...),
    projectName: str = Form(...),
    projectDescription: str = Form(...),
    db: Session = Depends(database.get_db),
):
    """Upload a new CSV file for a project.

    Validates the file, stores it with a sanitized name, creates a working copy,
    and returns the initial project data.
    """
    logger.info("Upload request: project=%s, file=%s", projectName, file.filename)
    validate_upload_file(file)

    original_path, copy_path = store_upload(file)
    df = read_csv_safe(original_path)

    project = create_project(db, projectName, str(copy_path), projectDescription)

    resp = dataframe_to_response(df)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
    }


@router.get("/get/{project_id}", response_model=schemas.ProjectResponse)
async def get_project_details(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Fetch full project details including all rows and columns."""
    project = get_project_or_404(project_id, db)
    df = read_csv_safe(project.file_path)

    resp = dataframe_to_response(df)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
    }


@router.get("/recent", response_model=list[schemas.LastResponse])
def recent_projects(db: Session = Depends(database.get_db)):
    """Get the most recently modified projects."""
    projects = get_recent_projects(db, limit=10)
    return [
        schemas.LastResponse(
            project_id=p.project_id,
            name=p.name,
            description=p.description,
            last_modified=p.last_modified,
        )
        for p in projects
    ]


@router.post("/{project_id}/save", response_model=schemas.ProjectResponse)
async def save_project(
    project_id: uuid.UUID,
    commit_message: str,
    db: Session = Depends(database.get_db),
):
    """Save project changes as a checkpoint.

    Replays all pending transformations from the change log onto the original
    file and creates a checkpoint record marking the save point.
    """
    project = get_project_or_404(project_id, db)

    # Load original file for replaying transformations
    original_path = get_original_path(project.file_path)
    df = read_csv_safe(original_path)

    # Get all unapplied logs for this project
    logs = (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied == False,  # noqa: E712
        )
        .order_by(models.ProjectChangeLog.timestamp)
        .all()
    )

    # Replay each logged transformation on the original
    for log in logs:
        df = apply_logged_transformation(df, log.action_type, log.action_details)

    save_csv_safe(df, original_path)

    # Create checkpoint (marks logs as applied)
    checkpoint = create_checkpoint(db, project_id, commit_message)

    resp = dataframe_to_response(df)
    logger.info("Project saved: id=%s, checkpoint=%s", project_id, checkpoint.id)
    return {
        "filename": project.name,
        "file_path": str(original_path),
        "project_id": project.project_id,
        **resp,
    }


@router.post("/{project_id}/revert", response_model=schemas.ProjectResponse)
async def revert_to_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID = None,
    db: Session = Depends(database.get_db),
):
    """Revert project to its original state or to a specific checkpoint.

    When checkpoint_id is provided, replays only the logs up to and including
    that checkpoint onto the original file. When None, reverts to the original
    uploaded state.
    """
    project = get_project_or_404(project_id, db)

    original_path = get_original_path(project.file_path)
    df = read_csv_safe(original_path)

    if checkpoint_id is not None:
        checkpoint = (
            db.query(models.Checkpoint)
            .filter(
                models.Checkpoint.id == checkpoint_id,
                models.Checkpoint.project_id == project_id,
            )
            .first()
        )
        if not checkpoint:
            raise HTTPException(status_code=404, detail="Checkpoint not found")

        # Find all checkpoint IDs created at or before the target checkpoint
        eligible_checkpoint_ids = [
            c.id
            for c in db.query(models.Checkpoint)
            .filter(
                models.Checkpoint.project_id == project_id,
                models.Checkpoint.created_at <= checkpoint.created_at,
            )
            .all()
        ]

        logs = (
            db.query(models.ProjectChangeLog)
            .filter(
                models.ProjectChangeLog.project_id == project_id,
                models.ProjectChangeLog.checkpoint_id.in_(eligible_checkpoint_ids),
                models.ProjectChangeLog.applied == True,  # noqa: E712
            )
            .order_by(models.ProjectChangeLog.timestamp)
            .all()
        )

        for log in logs:
            df = apply_logged_transformation(df, log.action_type, log.action_details)

    save_csv_safe(df, project.file_path)
    db.commit()

    resp = dataframe_to_response(df)
    logger.info("Project reverted: id=%s, checkpoint_id=%s", project_id, checkpoint_id)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
    }


@router.get("/{project_id}/export")
async def export_project(
    project_id: uuid.UUID,
    delimiter: schemas.ExportDelimiter = Query(default=schemas.ExportDelimiter.comma),
    include_header: bool = Query(default=True),
    encoding: schemas.ExportEncoding = Query(default=schemas.ExportEncoding.utf8),
    db: Session = Depends(database.get_db),
):
    """Download the current working copy of a project as a CSV file.

    Supports custom delimiter, header inclusion, and file encoding.
    """
    project = get_project_or_404(project_id, db)

    # Build a safe Content-Disposition header per RFC 6266.
    # Strip characters that would break the quoted-string token, then provide
    # both a legacy ASCII fallback and a percent-encoded filename* parameter
    # for non-ASCII names and modern browsers.
    safe_name = project.name.replace('"', "").replace("\\", "")
    encoded_name = quote(f"{safe_name}.csv", safe="")
    content_disposition = (
        f'attachment; filename="{safe_name}.csv"; '
        f"filename*=UTF-8''{encoded_name}"
    )
    headers = {"Content-Disposition": content_disposition}

    logger.info(
        "Export: id=%s, delimiter=%s, header=%s, encoding=%s",
        project_id, delimiter, include_header, encoding,
    )

    # Fast path: serve the raw file bytes for the default combination so that
    # no pandas round-trip can silently alter data values (leading zeros, date
    # reformatting, scientific notation, etc.).
    if (
        delimiter == schemas.ExportDelimiter.comma
        and include_header
        and encoding == schemas.ExportEncoding.utf8
    ):
        return FileResponse(
            project.file_path,
            media_type="text/csv; charset=utf-8",
            headers=headers,
        )

    # Non-default: read every cell as a string to preserve original
    # representations, then re-serialise with the requested options.
    df = read_csv_as_strings(project.file_path)

    buffer = io.StringIO()
    df.to_csv(buffer, index=False, sep=delimiter.to_char(), header=include_header)

    try:
        csv_bytes = buffer.getvalue().encode(encoding.value)
    except UnicodeEncodeError:
        raise HTTPException(
            status_code=400,
            detail=(
                f"The data contains characters that cannot be encoded as "
                f"{encoding.value}. Try UTF-8 instead."
            ),
        )

    # The full content is already in memory (required to catch the encoding
    # error above), so use Response directly rather than giving a false
    # impression of streaming via StreamingResponse.
    return Response(
        content=csv_bytes,
        media_type=f"text/csv; charset={encoding.value}",
        headers=headers,
    )


@router.delete("/{project_id}")
async def delete_project_endpoint(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Delete a project and its associated files."""
    project = get_project_or_404(project_id, db)
    delete_project_files(project.file_path)
    delete_project(db, project)
    return {"success": True, "message": "Project deleted"}
