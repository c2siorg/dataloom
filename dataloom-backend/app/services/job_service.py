"""Job rows: creation under the concurrency limits, ownership, and state transitions.

A job's state lives in the ``jobs`` table so a reload can find it again and a
restart can report it. Two kinds of caller use this module:

* request handlers, with the request's Session: create, fetch, list, cancel;
* the job runner, with a ``session_factory``: every write the worker makes
  opens its own short-lived Session, so a progress update never shares a
  transaction with the job's own work (SQLite allows one writer at a time).

Every transition is a conditional UPDATE on the status it expects, so a cancel
that races a worker's claim resolves to exactly one outcome without a lock.
"""

import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from app import models
from app.utils.logging import get_logger

logger = get_logger(__name__)

SessionFactory = Callable[[], Session]

INTERRUPTED_BY_RESTART = "Interrupted by a server restart"
INTERRUPTED_BY_SHUTDOWN = "Interrupted by a server shutdown"

# Serializes the limit checks with the insert. Jobs run in this process only,
# so a process-local lock makes the per-user cap exact; the partial unique index
# stays the authority for one exclusive job per project.
_create_lock = threading.Lock()

_PURGE_INTERVAL_SECONDS = 3600.0
_last_purge: float | None = None


class ActiveJobConflict(Exception):
    """An exclusive job is already queued or running on the project."""

    def __init__(self, job_id: uuid.UUID, message: str = "Another job is already running on this project."):
        super().__init__(message)
        self.job_id = job_id
        self.message = message


@dataclass(frozen=True)
class ClaimedJob:
    """The parts of a job row its run function needs, detached from any Session."""

    id: uuid.UUID
    owner_id: uuid.UUID
    project_id: uuid.UUID
    kind: str
    params: dict[str, Any]


def _now() -> datetime:
    return datetime.now(UTC)


def active_exclusive_job_id(db: Session, project_id: uuid.UUID) -> uuid.UUID | None:
    """Return the id of the project's queued or running exclusive job, if any."""
    return db.scalar(
        select(models.Job.id).where(
            models.Job.project_id == project_id,
            models.Job.is_exclusive.is_(True),
            models.Job.status.in_(models.JOB_ACTIVE_STATUSES),
        )
    )


def ensure_no_active_exclusive_job(db: Session, project_id: uuid.UUID) -> None:
    """Refuse a synchronous write while an exclusive job is active on the project.

    Answering 409 up front beats waiting on the project's write lock for as long
    as the job runs. The lock still serializes the two if a job is submitted
    just after this check, so correctness never depends on it.

    Raises:
        ActiveJobConflict: If an exclusive job is queued or running.
    """
    job_id = active_exclusive_job_id(db, project_id)
    if job_id is not None:
        raise ActiveJobConflict(job_id)


def ensure_owner_has_no_active_exclusive_job(db: Session, owner_id: uuid.UUID) -> None:
    """Refuse to delete an account while a job is rewriting one of its projects.

    Raises:
        ActiveJobConflict: If any of the owner's projects has an active exclusive job.
    """
    job_id = db.scalar(
        select(models.Job.id).where(
            models.Job.owner_id == owner_id,
            models.Job.is_exclusive.is_(True),
            models.Job.status.in_(models.JOB_ACTIVE_STATUSES),
        )
    )
    if job_id is not None:
        raise ActiveJobConflict(
            job_id,
            "A background job is still running on one of your projects. "
            "Cancel it or wait for it to finish, then try again.",
        )


def create_job(
    db: Session,
    *,
    owner_id: uuid.UUID,
    project_id: uuid.UUID,
    kind: str,
    is_exclusive: bool,
    params: dict[str, Any],
    max_active_per_user: int,
) -> models.Job:
    """Insert a queued job, enforcing the per-project and per-user limits.

    Args:
        db: The request's Session.
        owner_id: The submitting user.
        project_id: The project the job works on.
        kind: A ``JobKind`` value.
        is_exclusive: Whether the job rewrites the project.
        params: The validated parameters, JSON-serializable.
        max_active_per_user: The most queued plus running jobs a user may have.

    Returns:
        The committed job row.

    Raises:
        ActiveJobConflict: If ``is_exclusive`` and the project already has an
            active exclusive job, including one inserted by a concurrent submit.
        HTTPException: 429 if the user already has too many active jobs.
    """
    with _create_lock:
        if is_exclusive:
            ensure_no_active_exclusive_job(db, project_id)

        active = db.scalar(
            select(func.count())
            .select_from(models.Job)
            .where(models.Job.owner_id == owner_id, models.Job.status.in_(models.JOB_ACTIVE_STATUSES))
        )
        if active >= max_active_per_user:
            raise HTTPException(
                status_code=429,
                detail="You have too many jobs running. Wait for one to finish and try again.",
            )

        job = models.Job(
            owner_id=owner_id,
            project_id=project_id,
            kind=kind,
            is_exclusive=is_exclusive,
            params=params,
            progress_message="Queued",
        )
        db.add(job)
        try:
            db.commit()
        except IntegrityError:
            # The partial unique index caught a submit that raced ours past the
            # check above; report the winner.
            db.rollback()
            winner = active_exclusive_job_id(db, project_id)
            if winner is None:
                raise
            raise ActiveJobConflict(winner) from None
        db.refresh(job)

    logger.info(
        "job queued",
        extra={"job_id": str(job.id), "kind": kind, "project_id": str(project_id)},
    )
    return job


def get_owned_job(db: Session, job_id: uuid.UUID, owner: models.User) -> models.Job:
    """Fetch a job owned by the user, 404 otherwise (existence-hiding).

    Raises:
        HTTPException: 404 if the job does not exist or belongs to another user.
    """
    job = db.get(models.Job, job_id, populate_existing=True)
    if job is None or job.owner_id != owner.id:
        raise HTTPException(status_code=404, detail=f"Job with ID {job_id} not found")
    return job


def list_project_jobs(db: Session, project_id: uuid.UUID, *, active_only: bool, limit: int = 20) -> list[models.Job]:
    """A project's jobs, newest first: every active one, or the most recent ``limit``."""
    query = (
        select(models.Job)
        .where(models.Job.project_id == project_id)
        .order_by(models.Job.created_at.desc(), models.Job.id.desc())
        .execution_options(populate_existing=True)
    )
    if active_only:
        return list(db.scalars(query.where(models.Job.status.in_(models.JOB_ACTIVE_STATUSES))))
    return list(db.scalars(query.limit(limit)))


def request_cancel(db: Session, job: models.Job) -> models.Job:
    """Cancel a queued job outright, or flag a running one to stop between steps.

    Returns:
        The job's state after the request.

    Raises:
        HTTPException: 409 if the job has already finished.
    """
    changed = db.execute(
        update(models.Job)
        .where(models.Job.id == job.id, models.Job.status == models.JOB_QUEUED)
        .values(
            status=models.JOB_CANCELLED,
            cancel_requested=True,
            progress_message="Cancelled",
            finished_at=_now(),
        )
    ).rowcount
    if not changed:
        changed = db.execute(
            update(models.Job)
            .where(models.Job.id == job.id, models.Job.status == models.JOB_RUNNING)
            .values(cancel_requested=True)
        ).rowcount
    db.commit()
    db.refresh(job)

    if not changed:
        raise HTTPException(status_code=409, detail="Job has already finished.")
    logger.info(
        "job cancel requested",
        extra={"job_id": str(job.id), "kind": job.kind, "project_id": str(job.project_id), "status": job.status},
    )
    return job


# --- Worker-side transitions: each opens its own short-lived Session. ---


def claim_job(session_factory: SessionFactory, job_id: uuid.UUID) -> ClaimedJob | None:
    """Move a queued job to running. None if it was cancelled or deleted first."""
    with session_factory() as session:
        claimed = session.execute(
            update(models.Job)
            .where(models.Job.id == job_id, models.Job.status == models.JOB_QUEUED)
            .values(status=models.JOB_RUNNING, started_at=_now(), progress_message="Starting")
        ).rowcount
        session.commit()
        if not claimed:
            return None
        job = session.get(models.Job, job_id)
        if job is None:
            return None
        return ClaimedJob(
            id=job.id, owner_id=job.owner_id, project_id=job.project_id, kind=job.kind, params=dict(job.params)
        )


def write_progress(
    session_factory: SessionFactory, job_id: uuid.UUID, current: int, total: int | None, message: str
) -> None:
    """Record a running job's progress. A no-op once the job has left ``running``."""
    with session_factory() as session:
        session.execute(
            update(models.Job)
            .where(models.Job.id == job_id, models.Job.status == models.JOB_RUNNING)
            .values(progress_current=current, progress_total=total, progress_message=message[:200])
        )
        session.commit()


def finish_job(
    session_factory: SessionFactory,
    job_id: uuid.UUID,
    status: str,
    *,
    message: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
    progress_current: int | None = None,
) -> bool:
    """Move a running job to a terminal status.

    Returns:
        False if the row was no longer running — deleted along with its project,
        or already moved on — so the caller can log instead of raising.
    """
    values: dict[str, Any] = {
        "status": status,
        "progress_message": message,
        "result": result,
        "error": error,
        "finished_at": _now(),
    }
    if progress_current is not None:
        values["progress_current"] = progress_current
    with session_factory() as session:
        updated = session.execute(
            update(models.Job).where(models.Job.id == job_id, models.Job.status == models.JOB_RUNNING).values(**values)
        ).rowcount
        session.commit()
    return bool(updated)


def fail_active_jobs(session_factory: SessionFactory, error: str) -> int:
    """Mark every queued or running job failed with ``error``.

    Used at startup, where any active row was cut off by the previous process
    (jobs never outlive the process that runs them), and at shutdown for jobs
    that never got to run.
    """
    with session_factory() as session:
        failed = session.execute(
            update(models.Job)
            .where(models.Job.status.in_(models.JOB_ACTIVE_STATUSES))
            .values(status=models.JOB_FAILED, error=error, progress_message="Interrupted", finished_at=_now())
        ).rowcount
        session.commit()
    if failed:
        logger.warning("Marked %d interrupted job(s) as failed: %s", failed, error)
    return failed


def recover_interrupted_jobs(session_factory: SessionFactory) -> int:
    """Report jobs cut off by a restart as failed instead of leaving them running forever."""
    return fail_active_jobs(session_factory, INTERRUPTED_BY_RESTART)


def purge_expired_jobs(session_factory: SessionFactory, retention_days: int) -> int:
    """Delete finished jobs older than the retention period. Active jobs are never purged."""
    global _last_purge
    cutoff = _now() - timedelta(days=retention_days)
    with session_factory() as session:
        purged = session.execute(
            delete(models.Job).where(
                models.Job.status.in_(models.JOB_TERMINAL_STATUSES),
                models.Job.finished_at < cutoff,
            )
        ).rowcount
        session.commit()
    _last_purge = time.monotonic()
    if purged:
        logger.info("Purged %d expired job(s)", purged)
    return purged


def purge_expired_jobs_if_due(session_factory: SessionFactory, retention_days: int) -> None:
    """Purge at most once an hour, so a long-lived process still sheds old rows."""
    if _last_purge is None or time.monotonic() - _last_purge >= _PURGE_INTERVAL_SECONDS:
        purge_expired_jobs(session_factory, retention_days)
