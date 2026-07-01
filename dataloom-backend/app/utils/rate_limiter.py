"""Sliding-window rate limiter for auth endpoints.

Uses only Python stdlib (collections.deque, threading, time) with no external
dependencies.  The time function is injectable so tests can use a fake clock.
"""

import threading
import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    """Sliding-window rate limiter keyed by an arbitrary string (e.g. client IP).

    Thread-safe: all reads and writes to the internal store are guarded by a
    ``threading.Lock``.
    """

    def __init__(
        self,
        max_requests: int,
        window_seconds: int,
        time_func: Callable[[], float] | None = None,
    ) -> None:
        if max_requests < 1:
            raise ValueError("max_requests must be >= 1")
        if window_seconds < 1:
            raise ValueError("window_seconds must be >= 1")

        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._time = time_func or time.monotonic
        self._store: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> tuple[bool, float]:
        """Record a request for *key* and return whether it is allowed.

        Returns:
            Tuple of ``(allowed, retry_after)``.  When ``allowed`` is ``False``
            the caller should wait *retry_after* seconds before retrying.
        """
        now = self._time()
        window_start = now - self.window_seconds

        with self._lock:
            dq = self._store.get(key)
            if dq is None:
                self._store[key] = deque([now])
                return True, 0.0

            # Prune entries whose window has elapsed.
            while dq and dq[0] <= window_start:
                dq.popleft()

            if not dq:
                dq.append(now)
                return True, 0.0

            if len(dq) >= self.max_requests:
                retry_after = dq[0] + self.window_seconds - now
                return False, round(retry_after, 1)

            dq.append(now)
            return True, 0.0

    def reset(self, key: str | None = None) -> None:
        """Clear history for *key*, or all keys when *key* is ``None``."""
        with self._lock:
            if key is None:
                self._store.clear()
            else:
                self._store.pop(key, None)
