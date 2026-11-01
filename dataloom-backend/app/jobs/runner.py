"""The in-process executor that runs jobs off the request path.

One :class:`JobRunner` per process (the module-level :data:`runner`), started
and shut down by the application lifespan. It owns:

* a bounded ``ThreadPoolExecutor`` (``job_workers`` threads), separate from
  FastAPI's request threadpool, so a long job never takes a request thread;
* one ``threading.Event`` per live job, which the cancel endpoint sets and the
  job's :class:`~app.jobs.context.JobContext` checks between steps;
* ``session_factory``, the only source of the Sessions jobs use. Tests point
  it at their own engine, since a job must never touch the request's Session
  (closed once the response is sent) or ``app.database.engine`` directly.

``inline`` runs each job to completion in the submitting thread, so tests can
drive jobs deterministically without timing.
"""

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Literal

from fastapi import HTTPException
from sqlmodel import Session

from app import models
from app.jobs.context import JobCancelled, JobContext, JobFailed
from app.jobs.registry import JOB_REGISTRY
from app.services import job_service
from app.services.transformation_service import TransformationError
from app.utils.logging import get_logger, request_id_var
from app.utils.security import safe_http_exception_detail, safe_transformation_error_detail

logger = get_logger(__name__)

INTERNAL_ERROR = "Internal server error"

CancelReason = Literal["user", "shutdown"]


def _default_session_factory() -> Session:
    from app.database import engine

    return Session(engine)


def redact_job_error(error: Exception) -> str:
    """Turn whatever a job raised into a message safe to store and show.

    Uses the same redaction the endpoints use, so ``read_table_safe``'s
    path-bearing details and driver messages never reach ``jobs.error``.
    """
    if isinstance(error, JobFailed):
        return str(error)
    if isinstance(error, TransformationError):
        return safe_transformation_error_detail(error)
    if isinstance(error, HTTPException):
        safe = safe_http_exception_detail(error)
        if safe is not None:
            return safe
        if not isinstance(error.detail, str):
            return INTERNAL_ERROR
        return safe_transformation_error_detail(Exception(error.detail))
    return INTERNAL_ERROR


class JobRunner:
    """Executes submitted jobs on worker threads and relays cancel requests."""

    def __init__(self) -> None:
        self.session_factory: job_service.SessionFactory = _default_session_factory
        self.inline = False
        self._executor: ThreadPoolExecutor | None = None
        self._lock = threading.Lock()
        self._cancel_events: dict[uuid.UUID, threading.Event] = {}
        self._cancel_reasons: dict[uuid.UUID, CancelReason] = {}
        self._accepting = False

    @property
    def accepting(self) -> bool:
        """Whether a submitted job will run."""
        return self.inline or (self._accepting and self._executor is not None)

    def start(self, workers: int) -> None:
        """Start the worker threads. Called once from the application lifespan."""
        with self._lock:
            if self._executor is None:
                self._executor = ThreadPoolExecutor(max_workers=max(1, workers), thread_name_prefix="dataloom-job")
            self._accepting = True
        logger.info("Job runner started with %d worker(s)", max(1, workers))

    def shutdown(self) -> None:
        """Stop accepting jobs, stop running ones at their next step, and wait.

        A job already writing finishes. Jobs that never started are marked
        failed, like any other job this process cannot finish.
        """
        with self._lock:
            self._accepting = False
            executor, self._executor = self._executor, None
            for job_id, event in self._cancel_events.items():
                self._cancel_reasons.setdefault(job_id, "shutdown")
                event.set()
        if executor is not None:
            executor.shutdown(wait=True, cancel_futures=True)
        job_service.fail_active_jobs(self.session_factory, job_service.INTERRUPTED_BY_SHUTDOWN)
        with self._lock:
            self._cancel_events.clear()
            self._cancel_reasons.clear()

    def submit(self, job_id: uuid.UUID, request_id: str = "") -> None:
        """Queue a job whose row has been committed as ``queued``.

        Raises:
            RuntimeError: If the runner is not accepting jobs.
        """
        with self._lock:
            if not self.accepting:
                raise RuntimeError("The job runner is not accepting jobs")
            event = threading.Event()
            self._cancel_events[job_id] = event
            executor = self._executor
        if self.inline:
            self._run(job_id, event, request_id)
        else:
            try:
                executor.submit(self._run, job_id, event, request_id)
            except Exception:
                with self._lock:
                    self._cancel_events.pop(job_id, None)
                raise

    def request_cancel(self, job_id: uuid.UUID) -> None:
        """Ask a running job to stop at its next step boundary."""
        with self._lock:
            event = self._cancel_events.get(job_id)
            if event is not None:
                self._cancel_reasons.setdefault(job_id, "user")
                event.set()

    def _run(self, job_id: uuid.UUID, event: threading.Event, request_id: str) -> None:
        token = request_id_var.set(request_id)
        try:
            self._execute(job_id, event)
        except Exception:
            # _execute records every outcome itself; this only catches a failure
            # to record one (e.g. the database is down), which must not kill the
            # worker thread silently.
            logger.exception("Job runner failed to record the outcome of job %s", job_id)
        finally:
            request_id_var.reset(token)
            with self._lock:
                self._cancel_events.pop(job_id, None)
                self._cancel_reasons.pop(job_id, None)

    def _execute(self, job_id: uuid.UUID, event: threading.Event) -> None:
        job = job_service.claim_job(self.session_factory, job_id)
        if job is None:
            logger.info("job skipped: no longer queued", extra={"job_id": str(job_id)})
            return

        spec = JOB_REGISTRY[job.kind]
        ctx = JobContext(job_id, self.session_factory, event)
        log_extra = {"job_id": str(job_id), "kind": job.kind, "project_id": str(job.project_id)}
        logger.info("job started", extra=log_extra)
        started = time.monotonic()

        status, message, result, error = models.JOB_FAILED, "Failed", None, None
        try:
            with self.session_factory() as session:
                result = spec.run(ctx, session, job)
            status, message = models.JOB_SUCCEEDED, "Done"
        except JobCancelled:
            with self._lock:
                reason = self._cancel_reasons.get(job_id, "user")
            if reason == "shutdown":
                error = job_service.INTERRUPTED_BY_SHUTDOWN
            else:
                status, message = models.JOB_CANCELLED, "Cancelled"
        except Exception as e:
            error = redact_job_error(e)
            if isinstance(e, (JobFailed, TransformationError)):
                logger.warning("job failed: %s", e, extra=log_extra)
            else:
                logger.exception("job failed", extra=log_extra)

        recorded = job_service.finish_job(
            self.session_factory,
            job_id,
            status,
            message=message,
            result=result,
            error=error,
            progress_current=ctx.total if status == models.JOB_SUCCEEDED else None,
        )
        duration_ms = round((time.monotonic() - started) * 1000, 2)
        if recorded:
            logger.info("job finished", extra={**log_extra, "status": status, "duration_ms": duration_ms})
        else:
            logger.info(
                "job finished but its row is gone (project deleted?)",
                extra={**log_extra, "status": status, "duration_ms": duration_ms},
            )

    def drain(self) -> None:
        """Wait for every submitted job to finish and stop the workers. For tests.

        Unlike :meth:`shutdown`, running jobs are not asked to stop, so a test
        can finish before its tables are dropped without changing any outcome.
        """
        with self._lock:
            self._accepting = False
            executor, self._executor = self._executor, None
        if executor is not None:
            executor.shutdown(wait=True)


runner = JobRunner()
