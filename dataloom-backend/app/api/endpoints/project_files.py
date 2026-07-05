"""Add-file (append) API endpoints.

Lets users grow a project by appending more files: a stateless alignment
preview, the append itself, the project's file inventory, and re-appending an
inventory file whose rows were reverted away.

Each append stores the incoming file immutably and logs an ``addFile``
operation referencing it, so save/revert/undo replay stays correct: every
project state remains reconstructible from the original upload plus the log
chain. The stored files form the inventory (``project_files``) and are never
modified or deleted by data operations.
"""

import shutil
import tempfile
import uuid
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404, load_project_df
from app.services.append_service import analyze_append, append_dataframes
from app.services.file_service import store_added_file
from app.services.project_service import (
    create_project_file,
    get_project_file,
    get_project_files,
    log_transformation,
)
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_table_safe, save_table_safe
from app.utils.security import validate_upload_file

logger = get_logger(__name__)

router = APIRouter()


def _read_upload_df(file: UploadFile):
    """Parse an uploaded file into a DataFrame without storing it.

    Writes to a temp file so the format registry can dispatch on the
    extension, then cleans up. Parse failures surface as a clean 400 — a
    malformed upload is a client error, not a server fault.
    """
    suffix = Path(file.filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = Path(tmp.name)
    try:
        return read_table_safe(tmp_path)
    except HTTPException as e:
        raise HTTPException(status_code=400, detail=f"Could not parse the uploaded {suffix} file.") from e
    finally:
        with suppress(FileNotFoundError):
            tmp_path.unlink()


def _append_and_log(
    db: Session,
    project: models.Project,
    stored_path: str,
    original_filename: str,
    project_file_id: uuid.UUID,
) -> dict:
    """Append a stored inventory file onto the working copy and log it.

    Mirrors the transform endpoint's persistence contract: the working copy is
    written first, and if audit logging fails the file is restored so state
    never diverges from the log chain.

    Returns:
        The ProjectResponse payload for the combined data.
    """
    df = load_project_df(project)
    new_df = read_table_safe(Path(stored_path))
    combined = append_dataframes(df, new_df)

    save_table_safe(combined, project.file_path)
    details = {
        "add_file_params": {
            "file_path": stored_path,
            "project_file_id": str(project_file_id),
            "original_filename": original_filename,
            "rows_added": len(new_df),
        }
    }
    try:
        log_transformation(db, project.project_id, schemas.OperationType.addFile, details)
    except Exception:
        # Compensate the disk mutation so the working copy never holds rows
        # that the log chain cannot reproduce.
        try:
            save_table_safe(df, project.file_path)
        except Exception:
            logger.exception(
                "Failed to restore working copy after log failure: project_id=%s file=%s",
                project.project_id,
                original_filename,
            )
        raise

    total_rows = len(combined)
    resp = dataframe_to_response(combined)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        "page": 1,
        "page_size": total_rows,
        "total_rows": total_rows,
        "total_pages": 1,
        **resp,
    }


@router.post("/{project_id}/files/preview", response_model=schemas.AppendPreviewResponse)
async def preview_add_file(
    file: UploadFile = File(...),
    project: models.Project = Depends(get_project_or_404),
):
    """Preview how an uploaded file would align with the project's data.

    Stateless: the file is parsed, compared, and discarded. Nothing is stored
    until the client confirms via ``POST /{project_id}/files``.
    """
    await validate_upload_file(file)
    new_df = _read_upload_df(file)
    df = load_project_df(project)
    return analyze_append(df, new_df)


@router.post("/{project_id}/files", response_model=schemas.ProjectResponse)
async def add_file(
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Append an uploaded file's rows to the project.

    Stores the file in the project's inventory, appends its rows onto the
    working copy (columns unioned, gaps left empty), and logs a replayable
    ``addFile`` operation.
    """
    logger.info("Add file request: project=%s, file=%s", project.project_id, file.filename)
    await validate_upload_file(file)

    try:
        stored_path = store_added_file(file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    # Validate the stored file parses before recording anything.
    try:
        read_table_safe(stored_path)
    except HTTPException as e:
        with suppress(FileNotFoundError):
            stored_path.unlink()
        ext = Path(file.filename).suffix.lower()
        if e.status_code >= 500:
            raise HTTPException(status_code=400, detail=f"Could not parse the uploaded {ext} file.") from e
        raise

    project_file = create_project_file(db, project.project_id, str(stored_path), file.filename)
    return _append_and_log(db, project, str(stored_path), file.filename, project_file.id)


@router.get("/{project_id}/files", response_model=list[schemas.ProjectFileResponse])
async def list_project_files(
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """List the project's file inventory (files added after the initial upload)."""
    return get_project_files(db, project.project_id)


@router.post("/{project_id}/files/{file_id}/append", response_model=schemas.ProjectResponse)
async def reappend_project_file(
    file_id: uuid.UUID,
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Append an inventory file's rows to the project again.

    For restoring a file whose rows were removed by revert/undo — the stored
    file is immutable, so the append is identical to the original one.
    """
    project_file = get_project_file(db, file_id, project.project_id)
    if project_file is None:
        raise HTTPException(status_code=404, detail="Project file not found")
    if not Path(project_file.file_path).exists():
        raise HTTPException(status_code=404, detail="Stored file is missing from disk")

    return _append_and_log(
        db,
        project,
        project_file.file_path,
        project_file.original_filename,
        project_file.id,
    )
