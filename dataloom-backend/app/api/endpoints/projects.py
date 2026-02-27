"""Project CRUD API endpoints.

Handles upload, retrieval, save (checkpoint), and revert operations.
"""

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from app import database, models, schemas
from app.api.dependencies import get_project_or_404
from app.services.project_service import (
    create_checkpoint,
    create_project,
    delete_project,
    get_all_checkpoints,
    get_recent_projects,
)
from app.services.file_service import delete_project_files, get_original_path, store_upload
from app.services.transformation_service import apply_logged_transformation
from app.utils.logging import get_logger
from app.utils.pandas_helpers import dataframe_to_response, read_csv_safe, save_csv_safe
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
    logs = db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.applied == False,
    ).order_by(models.ProjectChangeLog.timestamp).all()

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


@router.post("/{project_id}/checkpoints/{checkpoint_id}/revert", response_model=schemas.ProjectResponse)
async def revert_to_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID,
    db: Session = Depends(database.get_db),
):
    """Revert project to a specific checkpoint.

    Replays logs up to and including the target checkpoint onto the original file,
    and deletes all logs created after the checkpoint's timestamp.
    """
    project = get_project_or_404(project_id, db)

    # Fetch the target checkpoint
    checkpoint = db.query(models.Checkpoint).filter(
        models.Checkpoint.id == checkpoint_id,
        models.Checkpoint.project_id == project_id,
    ).first()
    
    if not checkpoint:
        raise HTTPException(status_code=404, detail="Checkpoint not found")

    # Load original file
    original_path = get_original_path(project.file_path)
    df = read_csv_safe(original_path)

    # Find all checkpoint IDs created at or before the target checkpoint
    eligible_checkpoint_ids = [
        c.id for c in db.query(models.Checkpoint).filter(
            models.Checkpoint.project_id == project_id,
            models.Checkpoint.created_at <= checkpoint.created_at,
        ).all()
    ]

    # Replay logs from eligible checkpoints (BEFORE cleanup)
    logs = db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.checkpoint_id.in_(eligible_checkpoint_ids),
        models.ProjectChangeLog.applied == True,
    ).order_by(models.ProjectChangeLog.timestamp).all()

    for log in logs:
        df = apply_logged_transformation(df, log.action_type, log.action_details)

    # Save the reverted state to working copy
    save_csv_safe(df, project.file_path)

    # NOW delete all logs created after this checkpoint's timestamp
    logs_to_delete = db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.timestamp > checkpoint.created_at,
    ).all()
    
    for log in logs_to_delete:
        db.delete(log)

    db.commit()

    resp = dataframe_to_response(df)
    logger.info("Project reverted: id=%s, checkpoint_id=%s, logs_deleted=%d", project_id, checkpoint_id, len(logs_to_delete))
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
    }


@router.get("/{project_id}/export")
async def export_project(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Download the current working copy of a project as a CSV file."""
    project = get_project_or_404(project_id, db)
    return FileResponse(project.file_path, media_type="text/csv", filename=f"{project.name}.csv")


@router.delete("/{project_id}")
async def delete_project_endpoint(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Delete a project and its associated files."""
    project = get_project_or_404(project_id, db)
    delete_project_files(project.file_path)
    delete_project(db, project)
    return {"success": True, "message": "Project deleted"}


@router.get("/{project_id}/checkpoints", response_model=list[schemas.CheckpointResponse])
async def get_project_checkpoints(project_id: uuid.UUID, db: Session = Depends(database.get_db)):
    """Get all checkpoints for a project ordered by creation time."""
    get_project_or_404(project_id, db)  # Verify project exists
    checkpoints = get_all_checkpoints(db, project_id)
    
    return [
        schemas.CheckpointResponse(
            id=checkpoint.id,
            message=checkpoint.message,
            created_at=checkpoint.created_at
        )
        for checkpoint in checkpoints
    ]
