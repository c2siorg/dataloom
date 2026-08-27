"""Per-project synchronization for the working copy and its change log.

The data endpoints run in FastAPI's threadpool (they are plain ``def`` handlers),
so two requests for the same project genuinely run in parallel. The format
writers in :mod:`app.utils.file_formats` truncate and rewrite
``project.file_path`` in place, which leaves two hazards:

* a reader can parse the file mid-write and see truncated or partial data;
* two read-modify-write requests can interleave, so the second one's save
  silently discards the first one's update.

This module hands out one readers-writer lock per project id:

* :func:`project_read_lock` is shared. Any number of readers run at once, which
  is the common case -- the UI opens several profiling panels together, and each
  one only reads.
* :func:`project_write_lock` is exclusive. It waits for in-flight readers and
  writers, and holds off new ones until the write completes.

The lock is writer-preferring: once a writer is waiting, arriving readers queue
behind it, so a steady stream of reads cannot starve a save.

Both helpers block the calling thread, so they must only be entered from a
threadpool worker -- never from an ``async def`` handler running on the event
loop, where blocking would stall every request for every project.

Locks are reference-counted and dropped once nobody holds or awaits them, so a
long-lived process does not accumulate one lock per project it ever touched.
"""

import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager


class _ReadWriteLock:
    """A writer-preferring readers-writer lock.

    ``threading`` ships no such primitive, and the shared-read case is what
    keeps concurrent profiling requests for one project from serializing.
    """

    def __init__(self) -> None:
        self._condition = threading.Condition(threading.Lock())
        self._readers = 0
        self._writer_active = False
        self._writers_waiting = 0

    def acquire_read(self) -> None:
        with self._condition:
            # Yield to waiting writers so reads cannot starve a save.
            while self._writer_active or self._writers_waiting:
                self._condition.wait()
            self._readers += 1

    def release_read(self) -> None:
        with self._condition:
            self._readers -= 1
            if self._readers == 0:
                self._condition.notify_all()

    def acquire_write(self) -> None:
        with self._condition:
            self._writers_waiting += 1
            try:
                while self._writer_active or self._readers:
                    self._condition.wait()
            finally:
                self._writers_waiting -= 1
            self._writer_active = True

    def release_write(self) -> None:
        with self._condition:
            self._writer_active = False
            self._condition.notify_all()


_registry_lock = threading.Lock()
_project_locks: dict[uuid.UUID, tuple[_ReadWriteLock, int]] = {}


@contextmanager
def _project_lock(project_id: uuid.UUID, *, exclusive: bool) -> Iterator[None]:
    """Hold one project's lock in shared or exclusive mode.

    The registry entry is reference-counted around the whole hold, so the lock
    object cannot be evicted while another thread is still queued on it.
    """
    with _registry_lock:
        lock, users = _project_locks.get(project_id, (_ReadWriteLock(), 0))
        _project_locks[project_id] = (lock, users + 1)

    try:
        acquire, release = (
            (lock.acquire_write, lock.release_write) if exclusive else (lock.acquire_read, lock.release_read)
        )
        acquire()
        try:
            yield
        finally:
            release()
    finally:
        with _registry_lock:
            current_lock, users = _project_locks[project_id]
            if users == 1:
                del _project_locks[project_id]
            else:
                _project_locks[project_id] = (current_lock, users - 1)


@contextmanager
def project_read_lock(project_id: uuid.UUID) -> Iterator[None]:
    """Read one project's working copy alongside other readers.

    Excludes writers for the duration, so the caller never observes a torn
    in-place write. Concurrent readers of the same project, and every request
    for any other project, are unaffected.
    """
    with _project_lock(project_id, exclusive=False):
        yield


@contextmanager
def project_write_lock(project_id: uuid.UUID) -> Iterator[None]:
    """Mutate one project's working copy and change log exclusively.

    Excludes both readers and other writers, so a read-modify-write sequence
    cannot interleave with another one (lost update) and no reader observes the
    file mid-write. Other projects stay concurrent.

    Not reentrant: code already holding this lock must read through
    :func:`app.api.dependencies.read_project_df` rather than
    :func:`app.api.dependencies.load_project_df`, which would deadlock trying to
    re-enter as a reader.
    """
    with _project_lock(project_id, exclusive=True):
        yield
