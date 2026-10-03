"""The handle a run function reports progress and checks for cancellation through."""

import threading
import time
import uuid
from collections.abc import Callable

from app.services import job_service

# Step progress is written at most this often; stage changes always are.
PROGRESS_INTERVAL_SECONDS = 0.5

SAVING_MESSAGE = "Saving"


class JobCancelled(Exception):
    """Raised inside a run function to stop the job between steps."""


class JobFailed(Exception):
    """A failure whose message is already safe to show the client."""


class JobContext:
    """Progress and cancellation for one running job.

    Cancellation is cooperative: :meth:`step`, :meth:`check_cancelled` and
    :meth:`enter_commit_phase` raise :class:`JobCancelled` once a cancel is
    pending. After :meth:`enter_commit_phase` returns, the job has started
    writing and cancels are ignored, so a cancel can never leave a project half
    written.

    Progress goes to the job row through its own short-lived Session per write,
    throttled to one step write per ``PROGRESS_INTERVAL_SECONDS``.
    """

    def __init__(
        self,
        job_id: uuid.UUID,
        session_factory: job_service.SessionFactory,
        cancel_event: threading.Event,
        *,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.job_id = job_id
        self.current = 0
        self.total: int | None = None
        self.message = ""
        self._session_factory = session_factory
        self._cancel_event = cancel_event
        self._clock = clock
        self._committing = False
        self._last_write: float | None = None

    @property
    def committing(self) -> bool:
        """Whether the job has started writing, after which it always finishes."""
        return self._committing

    def set_total(self, total: int | None) -> None:
        """Set the number of steps, or None while it is unknown."""
        self.total = total

    def check_cancelled(self) -> None:
        """Raise :class:`JobCancelled` if a cancel is pending and nothing is written yet."""
        if self._cancel_event.is_set() and not self._committing:
            raise JobCancelled()

    def stage(self, message: str) -> None:
        """Report a new stage of work, such as reading the data. Always written."""
        self.message = message
        self._write(force=True)

    def step(self, message: str) -> None:
        """Start the next step. Stops here if a cancel is pending."""
        self.check_cancelled()
        self.current += 1
        self.message = message
        self._write(force=False)

    def replay_hook(self, index: int, total: int, label: str) -> None:
        """Adapt :meth:`step` to the services' ``on_step(index, total, label)`` hook."""
        self.set_total(total)
        self.step(f"Step {index + 1} of {total} · {label}")

    def enter_commit_phase(self) -> None:
        """Mark the point of no return, just before the first write.

        Raises:
            JobCancelled: If a cancel is pending; nothing has been written yet.
        """
        self.check_cancelled()
        self._committing = True
        if self.total is not None:
            self.current = self.total
        self.message = SAVING_MESSAGE
        self._write(force=True)

    def _write(self, *, force: bool) -> None:
        now = self._clock()
        if not force and self._last_write is not None and now - self._last_write < PROGRESS_INTERVAL_SECONDS:
            return
        self._last_write = now
        job_service.write_progress(self._session_factory, self.job_id, self.current, self.total, self.message)
