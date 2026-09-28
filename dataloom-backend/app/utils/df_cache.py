"""Process-local, size-bounded cache of parsed DataFrames keyed on file identity.

Each entry is validated on every lookup against a fingerprint of the file's
``os.stat`` result, so a rewrite outside the app (or one that races an
in-flight read) is never served stale. ``save_table_safe`` also invalidates
its target path on every write, which is the primary correctness guarantee;
the fingerprint check exists to catch external edits and to defend the
window between that check and a save.

Must not import :mod:`app.utils.pandas_helpers`, which imports this module.
"""

import os
import threading
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import NamedTuple

import pandas as pd

from app.config import get_settings


class _Fingerprint(NamedTuple):
    mtime_ns: int
    size: int
    ino: int


class _Entry(NamedTuple):
    fingerprint: _Fingerprint
    df: pd.DataFrame
    nbytes: int


def _fingerprint(st: os.stat_result) -> _Fingerprint:
    """Build a fingerprint from a stat result.

    Uses the integer nanosecond mtime field, never the float ``st_mtime``,
    which loses precision. ``st_ino`` is free on the same stat call and
    catches a writer that swaps the file via rename.
    """
    return _Fingerprint(st.st_mtime_ns, st.st_size, st.st_ino)


class DataFrameCache:
    """An LRU cache of parsed DataFrames, bounded by both bytes and entry count.

    One entry per absolute path rather than a composite (path, fingerprint)
    key: a save replaces its file's previous entry instead of leaving it
    resident until eviction, so memory tracks the number of files, not the
    number of writes.

    Thread-safe: a single lock guards the entry map, the byte total, and the
    generation counter. The loader itself runs outside the lock, so a slow
    read of one file never blocks a cache hit for another.
    """

    def __init__(self, max_bytes: int, max_entries: int) -> None:
        self.max_bytes = max_bytes
        self.max_entries = max_entries
        self.hits = 0
        self.misses = 0
        self._lock = threading.Lock()
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._total_bytes = 0
        self._generation = 0

    def get_or_load(self, path: str | Path, loader: Callable[[str | Path], pd.DataFrame]) -> pd.DataFrame:
        """Return the cached DataFrame for ``path``, loading and caching it if needed.

        Stats ``path`` before and after calling ``loader``; the entry is only
        stored if the fingerprint is unchanged across the read, so a file
        that is rewritten mid-read is never cached half-written. The loader
        runs outside the lock so concurrent reads of other files are not
        blocked.

        Args:
            path: Path to the dataset file, absolute or relative.
            loader: Callable that parses ``path`` into a DataFrame.

        Returns:
            A copy of the parsed DataFrame; the cached copy is never handed out
            directly, so callers may freely mutate the result.

        Raises:
            FileNotFoundError: If ``path`` does not exist.
        """
        key = os.path.abspath(path)
        fingerprint = _fingerprint(os.stat(key))

        with self._lock:
            entry = self._entries.get(key)
            if entry is not None and entry.fingerprint == fingerprint:
                self._entries.move_to_end(key)
                self.hits += 1
                return entry.df.copy()
            self.misses += 1
            generation = self._generation

        df = loader(path)

        try:
            post_fingerprint = _fingerprint(os.stat(key))
        except FileNotFoundError:
            return df.copy()

        if post_fingerprint == fingerprint:
            nbytes = int(df.memory_usage(deep=True).sum())
            self._store(key, post_fingerprint, df, nbytes, generation)

        return df.copy()

    def _store(self, key: str, fingerprint: _Fingerprint, df: pd.DataFrame, nbytes: int, generation: int) -> None:
        """Store a freshly loaded entry, unless it was invalidated mid-read or is oversized."""
        with self._lock:
            if generation != self._generation:
                return
            self._put_locked(key, fingerprint, df, nbytes)

    def _put_locked(self, key: str, fingerprint: _Fingerprint, df: pd.DataFrame, nbytes: int) -> None:
        """Insert or replace ``key``'s entry and evict down to the bounds. Caller holds the lock."""
        if nbytes > self.max_bytes:
            return

        old = self._entries.pop(key, None)
        if old is not None:
            self._total_bytes -= old.nbytes

        self._entries[key] = _Entry(fingerprint, df, nbytes)
        self._total_bytes += nbytes

        while self._entries and (self._total_bytes > self.max_bytes or len(self._entries) > self.max_entries):
            _, evicted = self._entries.popitem(last=False)
            self._total_bytes -= evicted.nbytes

    def alias(self, src: str | Path, dst: str | Path) -> bool:
        """Serve ``src``'s cached DataFrame for ``dst`` too, if ``src``'s entry is current.

        For a byte-for-byte copy of ``src`` (an undo snapshot, or a snapshot
        restored over the working copy): parsing ``dst`` would reproduce the
        frame already cached for ``src``, so the copy is registered instead of
        re-parsed. The entry is only aliased while ``src``'s fingerprint still
        matches, so a stale frame is never attached to the copy, and ``dst``
        is stored under its own fingerprint, so a later rewrite of ``dst`` is
        still a miss.

        The frame object is shared between the two entries. That is safe
        because cached frames are never mutated (reads hand out copies), and
        each entry counts its full ``nbytes``, which only overstates memory.

        Args:
            src: Path whose cached entry to reuse.
            dst: Path of a byte-identical copy of ``src``.

        Returns:
            True if ``dst`` now has an entry, False if ``src`` had no current one.
        """
        src_key = os.path.abspath(src)
        dst_key = os.path.abspath(dst)
        try:
            src_fingerprint = _fingerprint(os.stat(src_key))
            dst_fingerprint = _fingerprint(os.stat(dst_key))
        except FileNotFoundError:
            return False

        with self._lock:
            entry = self._entries.get(src_key)
            if entry is None or entry.fingerprint != src_fingerprint:
                return False
            self._entries.move_to_end(src_key)
            self._put_locked(dst_key, dst_fingerprint, entry.df, entry.nbytes)
        return True

    def invalidate(self, path: str | Path) -> None:
        """Evict ``path``'s entry, if any, and bump the generation counter.

        The generation bump also refuses any store already in flight for this
        (or any other) path from before the invalidation, closing the race
        where a slow reader would otherwise overwrite a newer invalidation
        with stale data.
        """
        key = os.path.abspath(path)
        with self._lock:
            self._generation += 1
            old = self._entries.pop(key, None)
            if old is not None:
                self._total_bytes -= old.nbytes

    def clear(self) -> None:
        """Evict every entry and bump the generation counter."""
        with self._lock:
            self._generation += 1
            self._entries.clear()
            self._total_bytes = 0


_cache: DataFrameCache | None = None
_cache_lock = threading.Lock()


def get_df_cache() -> DataFrameCache:
    """Return the process-wide cache singleton, built lazily from current settings."""
    global _cache
    if _cache is None:
        with _cache_lock:
            if _cache is None:
                settings = get_settings()
                _cache = DataFrameCache(
                    max_bytes=settings.df_cache_max_bytes,
                    max_entries=settings.df_cache_max_entries,
                )
    return _cache


def alias(src: str | Path, dst: str | Path) -> bool:
    """Register the singleton cache's current entry for ``src`` under its byte copy ``dst``."""
    return get_df_cache().alias(src, dst)


def invalidate(path: str | Path) -> None:
    """Evict ``path`` from the singleton cache, if it holds one."""
    get_df_cache().invalidate(path)


def clear() -> None:
    """Empty the singleton cache and reset it, so it is rebuilt from current settings.

    Used by tests that change ``df_cache_*`` settings between cases, since
    :func:`get_df_cache` otherwise only reads settings once per process.
    """
    global _cache
    with _cache_lock:
        if _cache is not None:
            _cache.clear()
        _cache = None
