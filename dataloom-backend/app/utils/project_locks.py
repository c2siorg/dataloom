"""Per-project synchronization for file and change-log mutations."""

import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager

_registry_lock = threading.Lock()
_project_locks: dict[uuid.UUID, tuple[threading.Lock, int]] = {}


@contextmanager
def project_write_lock(project_id: uuid.UUID) -> Iterator[None]:
    """Serialize reads and writes of one project's working copy.

    The same lock covers writers and readers of ``project.file_path`` so a
    threadpool reader cannot observe a torn in-place write. Independent
    projects stay concurrent.
    """
    with _registry_lock:
        lock, users = _project_locks.get(project_id, (threading.Lock(), 0))
        _project_locks[project_id] = (lock, users + 1)

    try:
        with lock:
            yield
    finally:
        with _registry_lock:
            current_lock, users = _project_locks[project_id]
            if users == 1:
                del _project_locks[project_id]
            else:
                _project_locks[project_id] = (current_lock, users - 1)
