"""Database operations for projects, logs, and checkpoints."""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

import pandas as pd
import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app import models
from app.config import get_settings
from app.services import report_service, transformation_service
from app.services.file_service import restore_snapshot, take_snapshot, unlink_snapshots
from app.utils.logging import get_logger
from app.utils.pandas_helpers import save_table_safe

logger = get_logger(__name__)


def create_project(
    db: Session,
    name: str,
    file_path: str,
    description: str,
    owner_id: uuid.UUID,
) -> models.Project:
    """Create a new project record in the database.

    Args:
        db: Database session.
        name: Project name.
        file_path: Path to the working copy CSV.
        description: Project description.
        owner_id: User that owns the project.

    Returns:
        The created Project model instance.
    """
    project = models.Project(owner_id=owner_id, name=name, file_path=file_path, description=description)
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("Created project: id=%s, name=%s", project.project_id, name)
    return project


def create_project_file(
    db: Session,
    project_id: uuid.UUID,
    file_path: str,
    original_filename: str,
) -> models.ProjectFile:
    """Record an added file in a project's inventory.

    Args:
        db: Database session.
        project_id: The project the file was added to.
        file_path: Path to the stored immutable file.
        original_filename: The filename as uploaded by the user.

    Returns:
        The created ProjectFile model instance.
    """
    project_file = models.ProjectFile(
        project_id=project_id,
        file_path=file_path,
        original_filename=original_filename,
    )
    db.add(project_file)
    db.commit()
    db.refresh(project_file)
    logger.info("Added project file: id=%s, project_id=%s, name=%s", project_file.id, project_id, original_filename)
    return project_file


def get_project_files(db: Session, project_id: uuid.UUID) -> list[models.ProjectFile]:
    """Fetch a project's file inventory ordered by upload time ascending.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        List of ProjectFile model instances.
    """
    return (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project_id)
        .order_by(models.ProjectFile.uploaded_at)
        .all()
    )


def get_project_file(db: Session, file_id: uuid.UUID, project_id: uuid.UUID) -> models.ProjectFile | None:
    """Fetch a single inventory file scoped to a project.

    Args:
        db: Database session.
        file_id: The inventory file primary key.
        project_id: The project the file must belong to.

    Returns:
        The ProjectFile model instance, or None if not found in this project.
    """
    return (
        db.query(models.ProjectFile)
        .filter(
            models.ProjectFile.id == file_id,
            models.ProjectFile.project_id == project_id,
        )
        .first()
    )


def get_recent_projects(db: Session, owner_id: uuid.UUID, limit: int = 3) -> list[models.Project]:
    """Fetch a user's most recently modified projects.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        limit: Maximum number of projects to return.

    Returns:
        List of Project model instances ordered by last_modified desc.
    """
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == owner_id)
        .order_by(models.Project.last_modified.desc())
        .limit(limit)
        .all()
    )


def delete_project(db: Session, project: models.Project) -> None:
    """Delete a project record from the database.

    Associated logs are deleted before checkpoints and undo steps because logs
    can reference both directly. Snapshot files are the caller's to remove,
    after this commits.

    Args:
        db: Database session.
        project: The Project model instance to delete.
    """
    project_id = project.project_id
    project_name = project.name

    try:
        deleted_logs = (
            db.query(models.ProjectChangeLog)
            .filter(models.ProjectChangeLog.project_id == project_id)
            .delete(synchronize_session=False)
        )
        deleted_steps = (
            db.query(models.UndoStep).filter(models.UndoStep.project_id == project_id).delete(synchronize_session=False)
        )
        deleted_checkpoints = (
            db.query(models.Checkpoint)
            .filter(models.Checkpoint.project_id == project_id)
            .delete(synchronize_session=False)
        )
        deleted_files = (
            db.query(models.ProjectFile)
            .filter(models.ProjectFile.project_id == project_id)
            .delete(synchronize_session=False)
        )
        deleted_projects = (
            db.query(models.Project).filter(models.Project.project_id == project_id).delete(synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Failed to delete project database records: id=%s, name=%s", project_id, project_name)
        raise

    if deleted_projects == 0:
        logger.warning("Project delete matched no project row: id=%s, name=%s", project_id, project_name)

    logger.info(
        "Deleted project: id=%s, name=%s, projects=%d, logs=%d, undo_steps=%d, checkpoints=%d, files=%d",
        project_id,
        project_name,
        deleted_projects,
        deleted_logs,
        deleted_steps,
        deleted_checkpoints,
        deleted_files,
    )


def _add_log_rows(
    db: Session,
    project_id: uuid.UUID,
    entries: Sequence[tuple[str, dict]],
    undo_step_id: int | None = None,
) -> None:
    """Stage change-log rows for ``entries``, in order, without committing."""
    for operation_type, details in entries:
        db.add(
            models.ProjectChangeLog(
                project_id=project_id,
                action_type=operation_type,
                action_details=details,
                undo_step_id=undo_step_id,
            )
        )


def _touch_project(db: Session, project_id: uuid.UUID) -> None:
    """Stage a ``last_modified`` bump for the project, without committing."""
    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()
    if project:
        project.last_modified = datetime.now(UTC)
        db.add(project)


def log_transformations(db: Session, project_id: uuid.UUID, entries: Sequence[tuple[str, dict]]) -> None:
    """Record transformation actions in the change log, in one commit.

    A pipeline run logs a whole sequence at once, so the project is touched once
    and the rows land together rather than one commit per step. The rows belong
    to no undo step; logged write paths go through :func:`commit_undoable_change`.

    Args:
        db: Database session.
        project_id: The project that was transformed.
        entries: The ``(operation_type, details)`` pairs to record, in order.
    """
    _add_log_rows(db, project_id, entries)
    _touch_project(db, project_id)
    db.commit()
    logger.debug(
        "Logged transformations: project_id=%s, types=%s",
        project_id,
        [operation_type for operation_type, _ in entries],
    )


def log_transformation(db: Session, project_id: uuid.UUID, operation_type: str, details: dict) -> None:
    """Record a single transformation action in the change log.

    Args:
        db: Database session.
        project_id: The project that was transformed.
        operation_type: The type of operation performed.
        details: Full transformation parameters as a dict.
    """
    log_transformations(db, project_id, [(operation_type, details)])


def commit_undoable_change(
    db: Session,
    project: models.Project,
    result_df: pd.DataFrame,
    entries: Sequence[tuple[str, dict]],
) -> None:
    """Write a transformed working copy and log it as one undo step.

    Every logged write path (a transform, a pipeline Run, a file append) comes
    through here, so one user action is one undo step however many change-log
    rows it produces. The working copy is snapshotted before it is written:
    undo restores that snapshot instead of replaying the change log, and the
    same snapshot compensates the write if logging fails, restoring the exact
    bytes rather than re-serializing a DataFrame.

    A new step discards the redo stack, and pre-change snapshots past
    ``undo_snapshot_limit`` are evicted. Their files are deleted only after the
    commit that stops referencing them succeeds, so a crash can orphan a file
    but never delete one still in use.

    Must run under the project's write lock.

    Args:
        db: Database session.
        project: The project being changed.
        result_df: The new data for the working copy.
        entries: The ``(action_type, action_details)`` pairs to log, in order.

    Raises:
        Exception: Re-raises whatever the write or the commit failed with,
            after putting the working copy back and rolling back.
    """
    project_id = project.project_id
    working_path = project.file_path
    before_path = take_snapshot(project_id, working_path)
    try:
        save_table_safe(result_df, working_path)
        stale_paths = discard_redo_stack(db, project_id)
        step = models.UndoStep(
            project_id=project_id,
            status=models.UNDO_STEP_DONE,
            entries=[{"action_type": action_type, "action_details": details} for action_type, details in entries],
            before_path=before_path,
        )
        db.add(step)
        db.flush()
        _add_log_rows(db, project_id, entries, undo_step_id=step.id)
        _touch_project(db, project_id)
        stale_paths += enforce_undo_retention(db, project_id)
        db.commit()
    except Exception:
        restored = restore_after_failure(before_path, working_path, project_id)
        db.rollback()
        if restored:
            unlink_snapshots([before_path])
        raise
    unlink_snapshots(stale_paths)


def restore_after_failure(snapshot_path: str, working_path: str, project_id: uuid.UUID) -> bool:
    """Put the working copy back from a snapshot after a failed change.

    Called while another exception is propagating, so a failure here is logged
    rather than raised, and the snapshot is left on disk: it is then the only
    copy of the data the working copy should hold.

    Args:
        snapshot_path: The snapshot holding the pre-change bytes.
        working_path: The project's working copy.
        project_id: The project, for the log line.

    Returns:
        True if the working copy was restored.
    """
    try:
        restore_snapshot(snapshot_path, working_path)
    except Exception:
        logger.exception("Failed to restore working copy from its snapshot: project_id=%s", project_id)
        return False
    return True


def discard_redo_stack(db: Session, project_id: uuid.UUID) -> list[str]:
    """Stage deletion of the project's undone steps; return their snapshot files.

    Undone steps have no change-log rows (undo deleted them), so nothing
    references them.
    """
    steps = (
        db.query(models.UndoStep)
        .filter(
            models.UndoStep.project_id == project_id,
            models.UndoStep.status == models.UNDO_STEP_UNDONE,
        )
        .all()
    )
    for step in steps:
        db.delete(step)
    return _snapshot_paths(steps)


def _snapshot_paths(steps: Sequence[models.UndoStep]) -> list[str]:
    return [path for step in steps for path in (step.before_path, step.after_path) if path]


def enforce_undo_retention(db: Session, project_id: uuid.UUID) -> list[str]:
    """Evict pre-change snapshots past ``undo_snapshot_limit``, oldest first.

    Only done steps count: an undone step on the redo stack needs its snapshot
    to redo safely. An evicted step stays undoable; undo falls back to replaying
    the change log for it. Does not commit.

    Args:
        db: Database session.
        project_id: The project to trim.

    Returns:
        The evicted snapshot files, to delete once the caller has committed.
    """
    limit = get_settings().undo_snapshot_limit
    steps = (
        db.query(models.UndoStep)
        .filter(
            models.UndoStep.project_id == project_id,
            models.UndoStep.status == models.UNDO_STEP_DONE,
            models.UndoStep.before_path.is_not(None),
        )
        .order_by(models.UndoStep.id.desc())
        .all()
    )
    evicted = []
    for step in steps[limit:]:
        evicted.append(step.before_path)
        step.before_path = None
    return evicted


def discard_undo_history(db: Session, project_id: uuid.UUID) -> list[str]:
    """Stage deletion of every undo step for a project; return their snapshot files.

    Save and Revert end the unsaved stretch that undo and redo cover. Change-log
    rows are unlinked explicitly rather than through the FK's ``SET NULL``, which
    SQLite does not enforce. Does not commit; the caller's commit covers it.

    Args:
        db: Database session.
        project_id: The project whose undo history to clear.

    Returns:
        The snapshot files to delete once the caller has committed.
    """
    steps = db.query(models.UndoStep).filter(models.UndoStep.project_id == project_id).all()
    if not steps:
        return []
    db.query(models.ProjectChangeLog).filter(
        models.ProjectChangeLog.project_id == project_id,
        models.ProjectChangeLog.undo_step_id.is_not(None),
    ).update({"undo_step_id": None}, synchronize_session=False)
    for step in steps:
        db.delete(step)
    db.flush()
    return _snapshot_paths(steps)


def get_undo_state(db: Session, project_id: uuid.UUID) -> dict[str, bool]:
    """Report whether Undo and Redo currently have anything to act on.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        ``{"can_undo", "can_redo"}``: an unsaved change-log row exists, and an
        undone step exists.
    """
    can_undo = (
        db.query(models.ProjectChangeLog.change_log_id)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied.is_(False),
        )
        .first()
        is not None
    )
    can_redo = get_redo_step(db, project_id) is not None
    return {"can_undo": can_undo, "can_redo": can_redo}


def get_redo_step(db: Session, project_id: uuid.UUID) -> models.UndoStep | None:
    """Return the step Redo would restore: the most recently undone one."""
    return (
        db.query(models.UndoStep)
        .filter(
            models.UndoStep.project_id == project_id,
            models.UndoStep.status == models.UNDO_STEP_UNDONE,
        )
        .order_by(models.UndoStep.undone_seq.desc())
        .first()
    )


def mark_step_undone(db: Session, step: models.UndoStep, after_path: str) -> None:
    """Stage moving a step onto the top of the redo stack, without committing.

    Deletes the step's change-log rows (undone work is not applied work) and
    records the snapshot redo will restore.
    """
    # "fetch" also drops the deleted rows from the session, so the caller's
    # handle on the row it just undid cannot be flushed back.
    db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.undo_step_id == step.id).delete(
        synchronize_session="fetch"
    )
    top = (
        db.query(sa.func.max(models.UndoStep.undone_seq)).filter(models.UndoStep.project_id == step.project_id).scalar()
    )
    step.status = models.UNDO_STEP_UNDONE
    step.after_path = after_path
    step.undone_seq = (top or 0) + 1
    _touch_project(db, step.project_id)


def mark_step_redone(db: Session, step: models.UndoStep) -> None:
    """Stage re-applying a step, without committing.

    Re-inserts its change-log rows in their original order, as unsaved rows.
    """
    entries = [(entry["action_type"], entry["action_details"]) for entry in step.entries]
    _add_log_rows(db, step.project_id, entries, undo_step_id=step.id)
    step.status = models.UNDO_STEP_DONE
    step.after_path = None
    step.undone_seq = None
    _touch_project(db, step.project_id)


def create_checkpoint(db: Session, project_id: uuid.UUID, message: str) -> models.Checkpoint:
    """Create a save checkpoint and mark pending logs as applied.

    Args:
        db: Database session.
        project_id: The project to checkpoint.
        message: Commit message describing the save point.

    Returns:
        The created Checkpoint model instance.
    """
    checkpoint = models.Checkpoint(project_id=project_id, message=message)
    db.add(checkpoint)
    db.flush()  # Assigns ID before updating logs

    # Mark all unapplied logs as applied under this checkpoint
    logs = (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied == False,  # noqa: E712
        )
        .all()
    )

    for log in logs:
        log.applied = True
        log.checkpoint_id = checkpoint.id

    project = db.query(models.Project).filter(models.Project.project_id == project_id).first()

    if project:
        project.last_modified = datetime.now(UTC)

    db.commit()
    logger.info(
        "Checkpoint created: id=%s, project_id=%s, logs_applied=%d",
        checkpoint.id,
        project_id,
        len(logs),
    )
    return checkpoint


def get_checkpoints(db: Session, project_id: uuid.UUID) -> list[models.Checkpoint]:
    """Fetch all checkpoints for a project ordered by creation time descending.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        List of Checkpoint model instances ordered by created_at desc.
    """
    return (
        db.query(models.Checkpoint)
        .filter(models.Checkpoint.project_id == project_id)
        .order_by(models.Checkpoint.created_at.desc())
        .all()
    )


def get_last_pending_change_log(db: Session, project_id: uuid.UUID) -> models.ProjectChangeLog | None:
    """Get the most recent unsaved change log entry for a project — the one Undo reverses.

    Saved entries are skipped: they belong to a checkpoint, and undoing one
    would change what reverting to that checkpoint restores. Ordered by
    ``change_log_id`` because every row of a pipeline Run shares one timestamp.

    Args:
        db: Database session.
        project_id: The project to query.

    Returns:
        The newest entry with ``applied == False``, or None if there is none.
    """
    return (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied.is_(False),
        )
        .order_by(models.ProjectChangeLog.change_log_id.desc())
        .first()
    )


def delete_change_log(db: Session, log: models.ProjectChangeLog) -> None:
    """Delete a single change log entry.

    Args:
        db: Database session.
        log: The ProjectChangeLog entry to delete.
    """
    db.delete(log)
    db.flush()
    logger.debug("Deleted change log: id=%s, project_id=%s", log.change_log_id, log.project_id)


def delete_checkpoint(db: Session, checkpoint_id: uuid.UUID, project_id: uuid.UUID) -> None:
    """Delete a checkpoint and unlink its associated logs.

    Logs that referenced this checkpoint are not deleted — they are unlinked
    (checkpoint_id set to None) so the transformation history is preserved.

    Args:
        db: Database session.
        checkpoint_id: The checkpoint to delete.
        project_id: The project the checkpoint belongs to.

    Raises:
        HTTPException: If the checkpoint is not found.
    """

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

    # Unlink logs referencing this checkpoint
    db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.checkpoint_id == checkpoint_id).update(
        {"checkpoint_id": None}, synchronize_session="evaluate"
    )

    db.delete(checkpoint)
    db.flush()
    logger.info("Deleted checkpoint: id=%s, project_id=%s", checkpoint_id, project_id)


def _normalize_project_name(name: str) -> str:
    """Trim whitespace from a project name and ensure it is not empty.

    Args:
        name: The project name to normalize.

    Returns:
        The normalized project name.

    Raises:
        ValueError: If the project name is empty or whitespace-only.
    """
    trimmed_name = name.strip()
    if not trimmed_name:
        raise ValueError("Project name cannot be empty")
    return trimmed_name


def rename_project(db: Session, project: models.Project, new_name: str) -> models.Project:
    """Rename a project.

    Args:
        db: Database session.
        project: The project to rename.
        new_name: The new project name (must be non-empty after trimming).

    Returns:
        The updated Project model instance.

    Raises:
        ValueError: If new_name is empty or whitespace-only.
    """
    trimmed_name = _normalize_project_name(new_name)

    project.name = trimmed_name
    db.add(project)
    db.commit()
    db.refresh(project)
    logger.info("Renamed project: id=%s, new_name=%s", project.project_id, trimmed_name)
    return project


def search_projects(db: Session, owner_id: uuid.UUID, query: str, limit: int = 20) -> list[models.Project]:
    """Search a user's projects by name or description, case-insensitive.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        query: Search string to match against name/description.
        limit: Maximum number of results to return.

    Returns:
        List of matching Project model instances ordered by last_modified desc.
    """
    pattern = f"%{query}%"
    return (
        db.query(models.Project)
        .filter(
            models.Project.owner_id == owner_id,
            sa.or_(
                models.Project.name.ilike(pattern),
                models.Project.description.ilike(pattern),
            ),
        )
        .order_by(models.Project.last_modified.desc())
        .limit(limit)
        .all()
    )


def update_project(
    db: Session,
    project: models.Project,
    name: str | None,
    description: str | None,
) -> models.Project:
    """Update a project's name and/or description.

    Args:
        db: Database session.
        project: The project to update.
        name: The new project name. If provided, it is trimmed and must not be empty.
        description: The new project description. If provided, it is trimmed before being saved.

    Returns:
        The updated Project model instance.

    Raises:
        ValueError: If ``name`` is provided but is empty after trimming.
    """
    if name is not None:
        trimmed = _normalize_project_name(name)
        project.name = trimmed

    if description is not None:
        project.description = description.strip()

    db.add(project)
    db.commit()
    db.refresh(project)

    logger.info("Updated project: id=%s", project.project_id)
    return project


def get_projects(
    db: Session,
    owner_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[models.Project]:
    """Fetch a user's projects with pagination.

    Args:
        db: Database session.
        owner_id: Restrict results to projects owned by this user.
        limit: Maximum number of projects to return.
        offset: Number of projects to skip.

    Returns:
        List of Project model instances ordered by last_modified desc.
    """
    return (
        db.query(models.Project)
        .filter(models.Project.owner_id == owner_id)
        .order_by(models.Project.last_modified.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def _timestamp(value: datetime | None) -> str:
    """Format a stored time for the Report, in the document's one date style."""
    return value.strftime(report_service.TIMESTAMP_FORMAT) if value else "—"


def _transformation(log: models.ProjectChangeLog) -> dict:
    return {
        "label": transformation_service.operation_label(log.action_type),
        "summary": transformation_service.operation_summary(log.action_type, log.action_details or {}),
        "timestamp": _timestamp(log.timestamp),
    }


def collect_provenance(db: Session, project_id: uuid.UUID) -> dict:
    """Gather a project's source files and applied work, grouped by checkpoint.

    Applied transformations that belong to no checkpoint are reported separately
    as unsaved, matching what the History panel shows. The result is plain dicts
    of display-ready strings, so the report builder stays free of the DB.

    Args:
        db: Database session.
        project_id: The project primary key.

    Returns:
        ``{files, checkpoints, unsaved}``.
    """
    files = (
        db.query(models.ProjectFile)
        .filter(models.ProjectFile.project_id == project_id)
        .order_by(models.ProjectFile.uploaded_at)
        .all()
    )
    logs = (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied.is_(True),
        )
        .order_by(models.ProjectChangeLog.change_log_id)
        .all()
    )
    checkpoints = (
        db.query(models.Checkpoint)
        .filter(models.Checkpoint.project_id == project_id)
        .order_by(models.Checkpoint.created_at)
        .all()
    )

    by_checkpoint: dict = {}
    unsaved: list[dict] = []
    for log in logs:
        if log.checkpoint_id is None:
            unsaved.append(_transformation(log))
        else:
            by_checkpoint.setdefault(log.checkpoint_id, []).append(_transformation(log))

    return {
        "files": [{"filename": f.original_filename, "uploaded_at": _timestamp(f.uploaded_at)} for f in files],
        "checkpoints": [
            {
                "message": checkpoint.message,
                "created_at": _timestamp(checkpoint.created_at),
                "transformations": by_checkpoint.get(checkpoint.id, []),
            }
            for checkpoint in checkpoints
        ],
        "unsaved": unsaved,
    }
