"""Project CRUD API endpoints.

Handles upload, retrieval, save (checkpoint), and revert operations.
"""

import os
import shutil
import tempfile
import uuid
from contextlib import suppress
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool

from app import database, models, schemas
from app.api.dependencies import get_current_user, get_project_or_404, read_project_df
from app.services.file_service import (
    delete_project_files,
    delete_project_snapshots,
    get_original_path,
    restore_snapshot,
    snapshot_exists,
    store_upload,
    take_snapshot,
    unlink_snapshots,
)
from app.services.project_service import (
    create_checkpoint,
    create_project,
    delete_project,
    discard_redo_stack,
    discard_undo_history,
    enforce_undo_retention,
    get_last_pending_change_log,
    get_project_files,
    get_projects,
    get_recent_projects,
    get_redo_step,
    get_undo_state,
    mark_step_redone,
    mark_step_undone,
    rename_project,
    restore_after_failure,
    search_projects,
    update_project,
    reset_project,
)
from app.services.transformation_service import apply_logged_transformation
from app.utils.file_formats import TableWriteOptions, get_format, get_format_for_extension
from app.utils.logging import get_logger
from app.utils.pandas_helpers import (
    dataframe_to_response,
    dataset_file_stats,
    paginate_dataframe,
    read_table_safe,
    save_table_safe,
)
from app.utils.project_locks import project_read_lock, project_write_lock
from app.utils.security import validate_upload_file

logger = get_logger(__name__)

router = APIRouter()


def _unlink_if_exists(path: str) -> None:
    with suppress(FileNotFoundError):
        os.unlink(path)


@router.post("/upload", response_model=schemas.ProjectResponse)
async def upload_project(
    file: UploadFile = File(...),
    projectName: str = Form(...),
    projectDescription: str = Form(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Upload a new dataset file (CSV, TSV, JSON, XLSX, or Parquet) for a project.

    Validates the file, stores it with a sanitized name, creates a working copy
    in the same native format, and returns the initial project data.
    """
    logger.info("Upload request: project=%s, file=%s", projectName, file.filename)
    await validate_upload_file(file)

    original_path, copy_path = await run_in_threadpool(store_upload, file)
    try:
        df = await run_in_threadpool(read_table_safe, original_path)
    except HTTPException as e:
        # The just-uploaded file could not be parsed — that's a bad client file,
        # not a server fault. Discard the orphaned files and report a clean 400.
        delete_project_files(str(copy_path))
        if e.status_code >= 500:
            ext = Path(file.filename).suffix.lower()
            raise HTTPException(status_code=400, detail=f"Could not parse the uploaded {ext} file.") from e
        raise

    project = create_project(db, projectName, str(copy_path), projectDescription, current_user.id)

    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


@router.get("", response_model=list[schemas.LastResponse])
def list_projects(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get the current user's projects with pagination."""
    projects = get_projects(db, owner_id=current_user.id, limit=limit, offset=offset)

    return [
        schemas.LastResponse(
            project_id=p.project_id,
            name=p.name,
            description=p.description,
            last_modified=p.last_modified,
        )
        for p in projects
    ]


@router.get("/get/{project_id}", response_model=schemas.ProjectResponse)
def get_project_details(
    page: int = 1,
    pageSize: int = 50,
    project: models.Project = Depends(get_project_or_404),
):
    """Fetch full project details including all rows and columns."""
    with project_read_lock(project.project_id):
        df = read_table_safe(project.file_path)

    total_rows = len(df)
    total_pages = (total_rows + pageSize - 1) // pageSize

    start = (page - 1) * pageSize
    end = start + pageSize
    paginated_df = df.iloc[start:end]

    resp = dataframe_to_response(paginated_df)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        "page": page,
        "page_size": pageSize,
        "total_rows": total_rows,
        "total_pages": total_pages,
        **resp,
    }


@router.get("/recent", response_model=list[schemas.LastResponse])
def recent_projects(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get the current user's most recently modified projects.

    Each entry also carries the working copy's size and shape for the project
    cards. A project whose file is missing or unreadable is still returned,
    with those fields null.
    """
    projects = get_recent_projects(db, owner_id=current_user.id, limit=10)
    result = []
    for p in projects:
        with project_read_lock(p.project_id):
            stats = dataset_file_stats(Path(p.file_path))
        result.append(
            schemas.LastResponse(
                project_id=p.project_id,
                name=p.name,
                description=p.description,
                last_modified=p.last_modified,
                upload_date=p.upload_date,
                file_size_bytes=stats.file_size_bytes,
                row_count=stats.row_count,
                column_count=stats.column_count,
            )
        )
    return result


@router.patch("/{project_id}/rename", response_model=schemas.RenameProjectResponse)
async def rename_project_endpoint(
    payload: schemas.RenameProjectRequest,
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Rename a project."""
    try:
        updated_project = rename_project(db, project, payload.name)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return {
        "project_id": str(updated_project.project_id),
        "filename": updated_project.name,
        "file_path": updated_project.file_path,
    }


@router.post("/{project_id}/save", response_model=schemas.ProjectResponse)
def save_project(
    project_id: uuid.UUID,
    commit_message: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Save the current working dataset as a checkpoint.

    The working copy already reflects the user's latest accepted transforms, so
    checkpoint creation should preserve that current dataset and only update the
    checkpoint/log metadata for pending actions.

    Saving also clears undo and redo: they cover unsaved work only, so every
    checkpoint stays exactly as saved.
    """
    with project_write_lock(project_id):
        original_path = get_original_path(project.file_path)
        if Path(project.file_path).resolve() == original_path.resolve():
            logger.error(
                "Project working copy unexpectedly points at original file: id=%s working_copy=%s original=%s",
                project_id,
                project.file_path,
                original_path,
            )
            raise HTTPException(
                status_code=500,
                detail=f"Project {project_id} working copy is misconfigured; please retry or contact support.",
            )

        df = read_table_safe(project.file_path)

        # Staged here and committed by create_checkpoint, so a failed save
        # cannot leave a redo stack pointing past the saved state.
        stale_snapshots = discard_undo_history(db, project_id)
        # Create checkpoint (marks logs as applied)
        checkpoint = create_checkpoint(db, project_id, commit_message)
        unlink_snapshots(stale_snapshots)

    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    logger.info("Project saved: id=%s, checkpoint=%s", project_id, checkpoint.id)
    return {
        "filename": project.name,
        "file_path": str(project.file_path),
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


@router.post("/{project_id}/revert", response_model=schemas.ProjectResponse)
def revert_to_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Revert project to its original state or to a specific checkpoint.

    When checkpoint_id is provided, replays only the logs up to and including
    that checkpoint onto the original file. When None, reverts to the original
    uploaded state.
    """
    with project_write_lock(project_id):
        return _revert_to_checkpoint(project_id, checkpoint_id, page, page_size, db, project)


def _revert_to_checkpoint(
    project_id: uuid.UUID,
    checkpoint_id: uuid.UUID | None,
    page: int,
    page_size: int,
    db: Session,
    project: models.Project,
) -> dict:
    original_path = get_original_path(project.file_path)
    df = read_table_safe(original_path)

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

    # Write file first — if this fails, DB is unchanged and state remains consistent.
    save_table_safe(df, project.file_path)
    # Undo and redo cover the unsaved work the revert just discarded.
    stale_snapshots = discard_undo_history(db, project_id)
    # Clear unapplied logs so a subsequent save cannot re-apply stale
    # transformations on top of the reverted file state.
    # Applies to all reverts (full and partial) to prevent stale log replay.
    db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.applied.is_(False),
    ).delete(synchronize_session="evaluate")
    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise
    unlink_snapshots(stale_snapshots)

    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    logger.info("Project reverted: id=%s, checkpoint_id=%s", project_id, checkpoint_id)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


@router.get("/{project_id}/export")
def export_project(
    fmt: str | None = Query(default=None, alias="format"),
    delimiter: str | None = Query(default=None),
    include_header: bool = Query(default=True),
    encoding: str | None = Query(default=None),
    project: models.Project = Depends(get_project_or_404),
):
    """Download a project's working copy in any supported format.

    Without ``format`` the file is served in its native format (streamed
    directly). With ``format`` set to a supported extension (e.g. ``csv``,
    ``json``), the working copy is converted to that format on the fly.

    For CSV/TSV targets the delimited-text options customize the output:
    ``delimiter`` (``comma``/``tab``/``semicolon``/``pipe``), ``include_header``
    (drop the header row when false), and ``encoding`` (``utf-8``/``latin-1``/
    ``ascii``/``utf-16``). Invalid delimiter or encoding values return 400. The
    temporary converted file is cleaned up after the response is sent.
    """
    logger.info(
        "Export requested: project=%s format=%s delimiter=%s header=%s encoding=%s",
        project.project_id,
        fmt or "native",
        delimiter,
        include_header,
        encoding,
    )
    source_fmt = get_format(project.file_path)
    target_fmt = source_fmt

    if fmt is not None:
        try:
            target_fmt = get_format_for_extension(fmt)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

    write_options = TableWriteOptions(
        delimiter=delimiter,
        include_header=include_header,
        encoding=encoding,
    )

    native = target_fmt.extension == source_fmt.extension and not write_options.has_options()

    # Snapshot under the shared read lock. FileResponse streams after we return,
    # so serving the live working copy could tear if a writer starts mid-download.
    with tempfile.NamedTemporaryFile(suffix=target_fmt.extension, delete=False) as tmp:
        tmp_path = tmp.name
    try:
        with project_read_lock(project.project_id):
            if native:
                shutil.copyfile(project.file_path, tmp_path)
            else:
                df = read_table_safe(project.file_path)
        if not native:
            save_table_safe(df, Path(tmp_path), write_options)
        return FileResponse(
            tmp_path,
            media_type=target_fmt.media_type,
            filename=f"{project.name}{target_fmt.extension}",
            background=BackgroundTask(_unlink_if_exists, tmp_path),
        )
    except Exception:
        _unlink_if_exists(tmp_path)
        raise


@router.delete("/{project_id}")
async def delete_project_endpoint(
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Delete a project and its associated files."""
    project_id = project.project_id
    project_name = project.name
    file_path = project.file_path
    # Snapshot inventory paths before the rows are deleted with the project.
    inventory_paths = [f.file_path for f in get_project_files(db, project_id)]

    logger.info("Delete project request: id=%s, name=%s, file_path=%s", project_id, project_name, file_path)

    try:
        delete_project(db, project)
    except SQLAlchemyError as e:
        logger.exception("Delete project database failure: id=%s, name=%s", project_id, project_name)
        raise HTTPException(status_code=500, detail="Failed to delete project records.") from e

    try:
        delete_project_files(file_path)
    except OSError:
        logger.exception(
            "Project database record deleted, but file cleanup failed: id=%s, name=%s, file_path=%s",
            project_id,
            project_name,
            file_path,
        )

    for inventory_path in inventory_paths:
        try:
            Path(inventory_path).unlink()
        except FileNotFoundError:
            logger.warning("Inventory file already missing: %s", inventory_path)
        except OSError:
            logger.exception("Failed to delete inventory file: id=%s, path=%s", project_id, inventory_path)

    delete_project_snapshots(project_id)

    return {"success": True, "message": "Project deleted"}


@router.post("/{project_id}/undo", response_model=schemas.ProjectResponse)
def undo_last_transformation(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
):
    """Undo the most recent unsaved user action.

    One action is one undo step: a transform, a whole pipeline Run, or a file
    append. The working copy is restored from the snapshot taken just before
    that action, so the result is exactly the data the user had. Steps whose
    snapshot was evicted, and rows logged before undo steps existed, fall back
    to rebuilding the working copy by replaying the change log onto the
    original. Either way the step moves onto the redo stack.

    Saved work is never undone — checkpoints and revert cover it — so with
    nothing unsaved this returns 404.
    """
    with project_write_lock(project_id):
        return _undo_last_transformation(project_id, page, page_size, project, db)


def _undo_last_transformation(
    project_id: uuid.UUID,
    page: int,
    page_size: int,
    project: models.Project,
    db: Session,
) -> dict:
    last_log = get_last_pending_change_log(db, project_id)
    if not last_log:
        raise HTTPException(status_code=404, detail="No transformations to undo")

    last_log_id = last_log.change_log_id
    step = db.get(models.UndoStep, last_log.undo_step_id) if last_log.undo_step_id is not None else None
    working_path = project.file_path
    # What redo will restore, and what a failed undo puts back.
    after_path = _snapshot_or_500(project_id, working_path, "undo")
    replay_snapshot = None
    working_changed = False
    try:
        if step is not None and snapshot_exists(step.before_path):
            replayed = False
            mark_step_undone(db, step, after_path)
            restore_snapshot(step.before_path, working_path)
            working_changed = True
            db.commit()
        else:
            replayed = True
            if step is None:
                # A row logged before undo steps existed. Give it a step so this
                # undo can be redone like any other.
                step = models.UndoStep(
                    project_id=project_id,
                    status=models.UNDO_STEP_DONE,
                    entries=[{"action_type": last_log.action_type, "action_details": last_log.action_details}],
                )
                db.add(step)
                db.flush()
                last_log.undo_step_id = step.id
                db.flush()
            mark_step_undone(db, step, after_path)
            df = _replay_change_log(db, project_id, working_path)
            working_changed = True
            save_table_safe(df, working_path)
            replay_snapshot = take_snapshot(project_id, working_path)
            step.before_path = replay_snapshot
            db.commit()
    except Exception as e:
        restored = not working_changed or restore_after_failure(after_path, working_path, project_id)
        db.rollback()
        unlink_snapshots([path for path in (replay_snapshot, after_path if restored else None) if path])
        if isinstance(e, OSError):
            raise HTTPException(status_code=500, detail="Could not undo; please retry.") from e
        raise

    if not replayed:
        # A cache hit: restore_snapshot registered the snapshot's parsed frame.
        df = read_project_df(project)
    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    logger.info("Undo: project_id=%s, log_id=%s, replayed=%s", project_id, last_log_id, replayed)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


def _replay_change_log(db: Session, project_id: uuid.UUID, working_path: str):
    """Rebuild the working copy's data from the original plus every remaining log row.

    Undo's fallback when a step has no snapshot. Ordered by ``change_log_id``:
    every row of a pipeline Run shares one timestamp.
    """
    df = read_table_safe(get_original_path(working_path))
    remaining_logs = (
        db.query(models.ProjectChangeLog)
        .filter(models.ProjectChangeLog.project_id == project_id)
        .order_by(models.ProjectChangeLog.change_log_id)
        .all()
    )
    for log in remaining_logs:
        df = apply_logged_transformation(df, log.action_type, log.action_details)
    return df


def _snapshot_or_500(project_id: uuid.UUID, working_path: str, action: str) -> str:
    """Snapshot the working copy, turning a disk failure into a clean, path-free 500."""
    try:
        return take_snapshot(project_id, working_path)
    except OSError as e:
        logger.exception("Could not snapshot working copy for %s: project_id=%s", action, project_id)
        raise HTTPException(status_code=500, detail=f"Could not {action}; please retry.") from e


@router.post("/{project_id}/redo", response_model=schemas.ProjectResponse)
def redo_last_transformation(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
):
    """Redo the most recently undone user action.

    Restores the working copy captured when that action was undone, rather than
    re-running it, so the result is exact even for steps that would not replay
    the same way twice (such as an unseeded sample). The action's change-log
    rows are re-inserted as unsaved rows. Any new logged change, a save, or a
    revert clears what can be redone.
    """
    with project_write_lock(project_id):
        return _redo_last_transformation(project_id, page, page_size, project, db)


def _redo_last_transformation(
    project_id: uuid.UUID,
    page: int,
    page_size: int,
    project: models.Project,
    db: Session,
) -> dict:
    step = get_redo_step(db, project_id)
    if step is None:
        raise HTTPException(status_code=404, detail="Nothing to redo")

    step_id, after_path, before_path = step.id, step.after_path, step.before_path
    working_path = project.file_path
    if not snapshot_exists(after_path):
        # Every deeper redo assumes this step's result, so none of them can
        # run either.
        logger.warning("Redo snapshot missing, discarding redo stack: project_id=%s step=%s", project_id, step_id)
        stale_snapshots = discard_redo_stack(db, project_id)
        db.commit()
        unlink_snapshots(stale_snapshots)
        raise HTTPException(status_code=404, detail="Nothing to redo")

    working_changed = False
    try:
        mark_step_redone(db, step)
        evicted = enforce_undo_retention(db, project_id)
        restore_snapshot(after_path, working_path)
        working_changed = True
        db.commit()
    except Exception as e:
        if working_changed:
            restore_after_failure(before_path, working_path, project_id)
        db.rollback()
        if isinstance(e, OSError):
            raise HTTPException(status_code=500, detail="Could not redo; please retry.") from e
        raise
    unlink_snapshots([after_path, *evicted])

    df = read_project_df(project)
    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    logger.info("Redo: project_id=%s, step=%s", project_id, step_id)
    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
        **pagination,
    }


@router.get("/{project_id}/undo-state", response_model=schemas.UndoStateResponse)
def get_project_undo_state(
    project: models.Project = Depends(get_project_or_404),
    db: Session = Depends(database.get_db),
):
    """Report whether Undo and Redo have anything to act on, so the UI can disable them."""
    return get_undo_state(db, project.project_id)


@router.get("/search", response_model=list[schemas.LastResponse])
def search_user_projects(
    q: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Search the current user's projects by name or description."""
    if not q or not q.strip():
        return []
    projects = search_projects(db, owner_id=current_user.id, query=q.strip(), limit=20)
    return [
        schemas.LastResponse(
            project_id=p.project_id,
            name=p.name,
            description=p.description,
            last_modified=p.last_modified,
        )
        for p in projects
    ]


@router.patch("/{project_id}", response_model=schemas.UpdateProjectResponse)
async def update_project_endpoint(
    payload: schemas.UpdateProjectRequest,
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Update project name and/or description."""
    try:
        updated = update_project(db, project, payload.name, payload.description)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    return {
        "project_id": str(updated.project_id),
        "filename": updated.name,
        "description": updated.description,
        "file_path": updated.file_path,
    }


@router.get("/{project_id}/meta", response_model=schemas.ProjectMetaResponse)
async def get_project_meta(
    project: models.Project = Depends(get_project_or_404),
):
    """Fetch project metadata only — no row data."""
    return schemas.ProjectMetaResponse(
        project_id=project.project_id,
        name=project.name,
        description=project.description,
        last_modified=project.last_modified,
    )


@router.post("/{project_id}/reset", response_model=schemas.ProjectResponse)
def reset_project_endpoint(
    project_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(database.get_db),
    project: models.Project = Depends(get_project_or_404),
):
    """Reset the project to its original uploaded state and discard all history."""
    with project_write_lock(project_id):
        return reset_project(
            project_id,
            page,
            page_size,
            db,
            project,
        )
