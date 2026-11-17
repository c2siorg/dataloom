"""Database operations for projects, logs, and checkpoints."""

import shutil
import tempfile
import uuid
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd
import sqlalchemy as sa
from fastapi import HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm.attributes import set_committed_value
from sqlmodel import Session

from app import models
from app.config import get_settings
from app.services import report_service, transformation_service
from app.services.file_service import (
    get_original_path,
    restore_original,
    restore_snapshot,
    take_snapshot,
    unlink_snapshots,
)
from app.utils.logging import get_logger
from app.utils.pandas_helpers import (
    dataframe_to_response,
    map_dtype,
    paginate_dataframe,
    read_table_safe,
    restore_semantic_dtypes,
    save_table_safe,
)

logger = get_logger(__name__)


def lock_working_copy_revision(db: Session, project_id: uuid.UUID, *, shared: bool = False) -> int:
    """Lock and return the persisted revision for a working-copy operation.

    PostgreSQL row locks extend the in-process readers/writer lock across
    application workers. A shared lock is used for previews; writers hold an
    exclusive row lock through their file and database transaction.
    """
    statement = (
        sa.select(models.Project.working_copy_revision)
        .where(models.Project.project_id == project_id)
        .with_for_update(read=shared)
    )
    revision = db.execute(statement).scalar_one_or_none()
    if revision is None:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    return int(revision)


def advance_working_copy_revision(db: Session, project: models.Project) -> int:
    """Advance a project's revision in the caller's file-and-history transaction.

    The project row was locked before the working copy was read. Executing this
    update before commit makes the revision change atomic with the existing
    undoable persistence transaction; a rollback leaves it unchanged.
    """
    statement = (
        sa.update(models.Project)
        .where(models.Project.project_id == project.project_id)
        .values(working_copy_revision=models.Project.working_copy_revision + 1)
        .returning(models.Project.working_copy_revision)
    )
    revision = db.execute(statement).scalar_one()
    set_committed_value(project, "working_copy_revision", int(revision))
    return int(revision)


def create_project(
    db: Session,
    name: str,
    file_path: str,
    description: str,
    owner_id: uuid.UUID,
    *,
    commit: bool = True,
    original_column_metadata: dict[str, str] | None = None,
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
    project = models.Project(
        owner_id=owner_id,
        name=name,
        file_path=file_path,
        description=description,
        original_column_metadata=original_column_metadata,
    )
    db.add(project)
    db.flush()
    if commit:
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


def create_project_column_metadata(
    db: Session,
    project_id: uuid.UUID,
    df: pd.DataFrame,
) -> None:
    """Persist the semantic dtype of every column in a project."""
    if not df.columns.is_unique or len({str(column) for column in df.columns}) != len(df.columns):
        raise ValueError("Project column labels must be unique after string normalization")
    for column_name, dtype in df.dtypes.items():
        db.add(
            models.ProjectColumnMetadata(
                project_id=project_id,
                column_name=str(column_name),
                column_dtype=map_dtype(dtype),
            )
        )
    db.flush()


def get_project_column_metadata(
    db: Session,
    project_id: uuid.UUID,
) -> dict[str, str]:
    """Return persisted semantic dtypes keyed by column name."""
    rows = db.query(models.ProjectColumnMetadata).filter(models.ProjectColumnMetadata.project_id == project_id).all()
    return {str(row.column_name): row.column_dtype for row in rows}


def replace_project_column_metadata(
    db: Session,
    project_id: uuid.UUID,
    metadata: dict[str, str],
) -> None:
    """Reconcile a project's metadata within the caller's transaction.

    Locking the project row serializes metadata writers across application
    workers on PostgreSQL. Per-row upserts use the unique project/column key,
    so simultaneous first-time backfills cannot race through delete/insert.
    SQLite serializes the write transaction and supports the same upsert.
    The helper deliberately does not commit; data, history, and metadata must
    commit or roll back together.
    """
    db.query(models.Project.project_id).filter(models.Project.project_id == project_id).with_for_update().first()

    table = models.ProjectColumnMetadata.__table__
    normalized = {str(column_name): column_dtype for column_name, column_dtype in metadata.items()}
    stale = db.query(models.ProjectColumnMetadata).filter(models.ProjectColumnMetadata.project_id == project_id)
    if normalized:
        stale = stale.filter(models.ProjectColumnMetadata.column_name.notin_(normalized))
    stale.delete(synchronize_session=False)

    if normalized:
        rows = [
            {"project_id": project_id, "column_name": column_name, "column_dtype": column_dtype}
            for column_name, column_dtype in normalized.items()
        ]
        dialect = db.get_bind().dialect.name
        insert = pg_insert if dialect == "postgresql" else sqlite_insert if dialect == "sqlite" else None
        if insert is None:
            raise RuntimeError(f"Atomic project metadata upserts are unsupported for database dialect {dialect!r}")
        statement = insert(table).values(rows)
        statement = statement.on_conflict_do_update(
            index_elements=[table.c.project_id, table.c.column_name],
            set_={"column_dtype": statement.excluded.column_dtype},
        )
        db.execute(statement)
    db.flush()


def reconcile_project_column_metadata(df: pd.DataFrame, metadata: dict[str, str]) -> dict[str, str]:
    """Return metadata for exactly ``df``'s columns, keeping valid semantics.

    Inferred types fill missing legacy entries. Persisted supported entries
    take precedence; stale column names and unknown dtype labels are dropped.
    Callers persist this only while already performing a legitimate write.
    """
    if not isinstance(metadata, dict):
        logger.warning("Ignoring malformed project column metadata container: type=%s", type(metadata).__name__)
        metadata = {}

    inferred = {str(column): map_dtype(dtype) for column, dtype in df.dtypes.items()}
    for stale_name in metadata.keys() - inferred.keys():
        logger.warning("Ignoring stale project column dtype metadata: column=%r", stale_name)
    supported = {"str", "int", "float", "bool", "datetime"}
    reconciled = {}
    for name, inferred_type in inferred.items():
        semantic_type = metadata.get(name)
        if isinstance(semantic_type, str) and semantic_type in supported:
            reconciled[name] = semantic_type
        else:
            if semantic_type is not None:
                logger.warning(
                    "Ignoring unsupported project column dtype metadata: column=%r dtype=%r",
                    name,
                    semantic_type,
                )
            reconciled[name] = inferred_type
    return reconciled


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
        # Explicit rather than left to the FK cascade, which SQLite does not enforce.
        deleted_jobs = (
            db.query(models.Job).filter(models.Job.project_id == project_id).delete(synchronize_session=False)
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
        "Deleted project: id=%s, name=%s, projects=%d, logs=%d, undo_steps=%d, checkpoints=%d, files=%d, jobs=%d",
        project_id,
        project_name,
        deleted_projects,
        deleted_logs,
        deleted_steps,
        deleted_checkpoints,
        deleted_files,
        deleted_jobs,
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


def _metadata_after_change(
    metadata_before: dict[str, str],
    result_df: pd.DataFrame,
    entries: Sequence[tuple[str, dict]],
    transitions: Sequence[tuple[str, dict, pd.DataFrame, pd.DataFrame]] | None,
    before_df: pd.DataFrame,
) -> dict[str, str]:
    """Reconcile semantic metadata using the actual transformation stages."""
    metadata_after = metadata_before.copy()
    if len(entries) == 1:
        action_type, details = entries[0]
        metadata_after = transformation_service.apply_metadata_transformation(
            metadata_after,
            action_type,
            details,
            before_df,
            result_df,
        )
    elif transitions is None or len(transitions) != len(entries):
        raise ValueError("Multi-step changes require one dataframe transition per entry")
    else:
        for action_type, details, stage_before, stage_after in transitions:
            metadata_after = transformation_service.apply_metadata_transformation(
                metadata_after,
                action_type,
                details,
                stage_before,
                stage_after,
            )

    return {
        str(column): metadata_after.get(str(column), map_dtype(result_df[column].dtype)) for column in result_df.columns
    }


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
    transitions: Sequence[tuple[str, dict, pd.DataFrame, pd.DataFrame]] | None = None,
) -> int:
    """Persist a transformed working copy as one atomic undoable action.

    The caller must hold the project's exclusive write lock. ``entries`` are
    the operation and serialized parameters in execution order; multiple
    entries (a pipeline) still create one undo step. The pre-change file and
    semantic metadata are both snapshotted so undo and redo restore the exact
    saved state. Change logs, metadata, the undo step, and the project touch
    commit in one database transaction. If any write or commit fails, the
    transaction is rolled back and the original file is restored.

    Oldest pre-change snapshots beyond ``undo_snapshot_limit`` and snapshots
    referenced by discarded redo steps are removed only after commit succeeds.
    A failed restoration leaves the snapshot on disk as the recovery copy.

    Args:
        db: Database session owning the transaction.
        project: Project whose working file is being changed.
        result_df: Final in-memory result of the transformation.
        entries: Ordered ``(action_type, action_details)`` pairs to log.

    Returns:
        The new working-copy revision after the transaction commits.

    Raises:
        Exception: Re-raises the original reconciliation, file, persistence,
            or commit exception after rollback and best-effort file restoration.
    """
    project_id = project.project_id
    working_path = project.file_path
    # Read once under the caller's write lock. The exact in-memory source used
    # by reconciliation is therefore the state represented by this snapshot.
    before_df = read_table_safe(working_path)
    before_path = take_snapshot(project_id, working_path)
    try:
        metadata_before = reconcile_project_column_metadata(before_df, get_project_column_metadata(db, project_id))
        before_df = restore_semantic_dtypes(before_df, metadata_before)

        metadata_after = _metadata_after_change(metadata_before, result_df, entries, transitions, before_df)

        save_table_safe(result_df, working_path)

        stale_paths = discard_redo_stack(db, project_id)

        step = models.UndoStep(
            project_id=project_id,
            status=models.UNDO_STEP_DONE,
            entries=[
                {
                    "action_type": action_type,
                    "action_details": details,
                }
                for action_type, details in entries
            ],
            before_path=before_path,
            metadata_before=metadata_before,
            metadata_after=metadata_after,
        )

        db.add(step)
        db.flush()

        _add_log_rows(
            db,
            project_id,
            entries,
            undo_step_id=step.id,
        )

        replace_project_column_metadata(
            db,
            project_id,
            metadata_after,
        )

        _touch_project(db, project_id)

        stale_paths += enforce_undo_retention(db, project_id)

        revision = advance_working_copy_revision(db, project)
        db.commit()

    except Exception:
        restored = restore_after_failure(
            before_path,
            working_path,
            project_id,
        )
        db.rollback()

        if restored:
            unlink_snapshots([before_path])

        raise

    unlink_snapshots(stale_paths)
    return revision


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
        return True
    except Exception:
        logger.exception("Failed to restore working copy from its snapshot: project_id=%s", project_id)
        return False


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


def mark_step_undone(
    db: Session,
    step: models.UndoStep,
    after_path: str,
) -> None:
    """Stage moving a step onto the redo stack, without committing."""
    db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.undo_step_id == step.id).delete(
        synchronize_session="fetch"
    )

    top = (
        db.query(sa.func.max(models.UndoStep.undone_seq)).filter(models.UndoStep.project_id == step.project_id).scalar()
    )

    step.status = models.UNDO_STEP_UNDONE
    step.after_path = after_path
    step.undone_seq = (top or 0) + 1

    if step.metadata_before is not None:
        replace_project_column_metadata(db, step.project_id, step.metadata_before)

    _touch_project(db, step.project_id)


def mark_step_redone(
    db: Session,
    step: models.UndoStep,
) -> None:
    """Stage re-applying a step, without committing."""
    entries = [(entry["action_type"], entry["action_details"]) for entry in step.entries]

    _add_log_rows(
        db,
        step.project_id,
        entries,
        undo_step_id=step.id,
    )

    step.status = models.UNDO_STEP_DONE
    step.after_path = None
    step.undone_seq = None

    if step.metadata_after is not None:
        replace_project_column_metadata(db, step.project_id, step.metadata_after)

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
    checkpoint = models.Checkpoint(
        project_id=project_id,
        message=message,
        metadata_snapshot=get_project_column_metadata(db, project_id),
    )
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

    checkpoint.last_change_log_id = (
        db.query(sa.func.max(models.ProjectChangeLog.change_log_id))
        .filter(models.ProjectChangeLog.project_id == project_id)
        .scalar()
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


def _logs_to_replay(db: Session, project_id: uuid.UUID, checkpoint_id: uuid.UUID) -> list[models.ProjectChangeLog]:
    """The applied logs that rebuild a project up to and including a checkpoint.

    Raises:
        HTTPException: 404 if the checkpoint does not belong to the project.
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

    if checkpoint.last_change_log_id is not None:
        return (
            db.query(models.ProjectChangeLog)
            .filter(
                models.ProjectChangeLog.project_id == project_id,
                models.ProjectChangeLog.change_log_id <= checkpoint.last_change_log_id,
                models.ProjectChangeLog.applied.is_(True),
            )
            .order_by(models.ProjectChangeLog.change_log_id)
            .all()
        )

    # Legacy checkpoints without a recorded boundary use their timestamp and
    # checkpoint links until they are saved again with a boundary.
    eligible_checkpoint_ids = [
        c.id
        for c in db.query(models.Checkpoint)
        .filter(
            models.Checkpoint.project_id == project_id,
            models.Checkpoint.created_at <= checkpoint.created_at,
        )
        .all()
    ]

    return (
        db.query(models.ProjectChangeLog)
        .filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.checkpoint_id.in_(eligible_checkpoint_ids),
            models.ProjectChangeLog.applied == True,  # noqa: E712
        )
        .order_by(models.ProjectChangeLog.change_log_id)
        .all()
    )


def revert_project(
    db: Session,
    project: models.Project,
    checkpoint_id: uuid.UUID | None,
    *,
    on_step: Callable[[int, int, str], None] | None = None,
    before_commit: Callable[[], None] | None = None,
) -> pd.DataFrame:
    """Rebuild a project's working copy from its original file.

    With a checkpoint, replays the applied logs up to and including it; without
    one, restores the original upload. Unapplied logs are cleared either way, so
    a later save cannot re-apply stale transformations on top of the reverted
    data. The caller holds the project's write lock.

    The replay runs in memory and the project is written once, at the end, so
    anything ``on_step`` or ``before_commit`` raises leaves the project exactly
    as it was.

    Args:
        db: Database session.
        project: The project to revert.
        checkpoint_id: The checkpoint to revert to, or None for the original.
        on_step: Optional hook called before replaying log ``index`` of
            ``total``, with the Operation's label. Whatever it raises propagates.
        before_commit: Optional hook called after the replay and before the
            first write.

    Returns:
        The reverted DataFrame.

    Raises:
        HTTPException: 404 if the checkpoint does not belong to the project, or
            whatever reading the original file raises.
    """
    project_id = project.project_id
    lock_working_copy_revision(db, project_id)
    logs = [] if checkpoint_id is None else _logs_to_replay(db, project_id, checkpoint_id)
    df = read_table_safe(get_original_path(project.file_path))
    if isinstance(project.original_column_metadata, dict):
        metadata_source = project.original_column_metadata
    else:
        metadata_source = get_project_column_metadata(db, project_id)
    metadata = reconcile_project_column_metadata(df, metadata_source)

    total = len(logs)
    for index, log in enumerate(logs):
        if on_step is not None:
            on_step(index, total, transformation_service.operation_label(log.action_type))
        before_df = df
        df = transformation_service.apply_logged_transformation(df, log.action_type, log.action_details)
        metadata = transformation_service.apply_metadata_transformation(
            metadata, log.action_type, log.action_details, before_df, df
        )

    if checkpoint_id is not None:
        checkpoint = db.query(models.Checkpoint).filter(models.Checkpoint.id == checkpoint_id).first()
        if checkpoint and isinstance(checkpoint.metadata_snapshot, dict):
            metadata = {str(column): dtype for column, dtype in checkpoint.metadata_snapshot.items()}
        elif checkpoint and checkpoint.metadata_snapshot is not None:
            logger.warning(
                "Ignoring malformed checkpoint dtype snapshot: project_id=%s checkpoint_id=%s type=%s",
                project_id,
                checkpoint_id,
                type(checkpoint.metadata_snapshot).__name__,
            )
    metadata = reconcile_project_column_metadata(df, metadata)
    df = restore_semantic_dtypes(df, metadata)

    if before_commit is not None:
        before_commit()

    working_path = Path(project.file_path)
    with tempfile.NamedTemporaryFile(
        dir=working_path.parent,
        prefix=".revert-backup-",
        suffix=working_path.suffix,
        delete=False,
    ) as backup_file:
        backup_path = Path(backup_file.name)

    try:
        shutil.copy2(working_path, backup_path)
        save_table_safe(df, project.file_path)
        replace_project_column_metadata(db, project_id, metadata)

        # Undo and redo cover the unsaved work the revert just discarded.
        stale_snapshots = discard_undo_history(db, project_id)
        # Clear unapplied logs so a subsequent save cannot re-apply stale
        # transformations on top of the reverted file state.
        # Applies to all reverts (full and partial) to prevent stale log replay.
        db.query(models.ProjectChangeLog).filter(
            models.ProjectChangeLog.project_id == project_id,
            models.ProjectChangeLog.applied.is_(False),
        ).delete(synchronize_session="evaluate")
        advance_working_copy_revision(db, project)
        db.commit()
    except Exception:
        db.rollback()
        try:
            restore_original(str(backup_path), str(working_path))
        except Exception:
            logger.exception(
                "Failed to restore working file after revert transaction failed: project_id=%s",
                project_id,
            )
            raise
        raise
    finally:
        backup_path.unlink(missing_ok=True)

    unlink_snapshots(stale_snapshots)
    return df


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


def reset_project(
    project_id: uuid.UUID,
    page: int,
    page_size: int,
    db: Session,
    project: models.Project,
) -> dict:
    """Reset a project to its original uploaded state and discard all history."""

    lock_working_copy_revision(db, project_id)

    original_path = get_original_path(project.file_path)
    working_path = Path(project.file_path)

    # Collect snapshot paths before deleting the undo/redo rows.
    undo_steps = db.query(models.UndoStep).filter(models.UndoStep.project_id == project_id).all()
    stale_snapshots = _snapshot_paths(undo_steps)

    # Back up the current working file so it can be restored if the
    # database transaction fails.
    with tempfile.NamedTemporaryFile(
        dir=working_path.parent,
        prefix=".reset-backup-",
        suffix=working_path.suffix,
        delete=False,
    ) as backup_file:
        backup_path = Path(backup_file.name)

    try:
        shutil.copy2(working_path, backup_path)

        # Restore the original dataset. This operation is atomic.
        restore_original(original_path, str(working_path))

        try:
            # Delete change logs before their referenced history records.
            db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.project_id == project_id).delete(
                synchronize_session="fetch"
            )

            db.query(models.Checkpoint).filter(models.Checkpoint.project_id == project_id).delete(
                synchronize_session="fetch"
            )

            db.query(models.UndoStep).filter(models.UndoStep.project_id == project_id).delete(
                synchronize_session="fetch"
            )

            df = read_table_safe(str(working_path))
            inferred_metadata = {str(column): map_dtype(dtype) for column, dtype in df.dtypes.items()}
            metadata_source = (
                project.original_column_metadata
                if isinstance(project.original_column_metadata, dict)
                else get_project_column_metadata(db, project_id)
            )
            metadata = reconcile_project_column_metadata(df, metadata_source or inferred_metadata)
            replace_project_column_metadata(db, project_id, metadata)

            advance_working_copy_revision(db, project)
            db.commit()

        except Exception:
            db.rollback()

            # The database reset failed, so restore the previous dataset.
            try:
                restore_original(str(backup_path), str(working_path))
            except Exception:
                logger.exception(
                    "Failed to restore working file after reset transaction failed: project_id=%s",
                    project_id,
                )
                raise

            raise

    finally:
        backup_path.unlink(missing_ok=True)

    # Only remove snapshots after the history deletion has committed.
    unlink_snapshots(stale_snapshots)

    df = read_table_safe(str(working_path))
    df = restore_semantic_dtypes(df, metadata)
    response_df, pagination = paginate_dataframe(df, page, page_size)
    resp = dataframe_to_response(response_df)
    resp["dtypes"] = {str(column): map_dtype(dtype) for column, dtype in df.dtypes.items()}

    logger.info("Project reset: id=%s", project_id)

    return {
        "filename": project.name,
        "file_path": project.file_path,
        "project_id": project.project_id,
        **resp,
        **pagination,
    }
