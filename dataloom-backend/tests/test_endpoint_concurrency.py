"""Regression tests ensuring data endpoints do not block the event loop.

Every data-heavy route performs synchronous, blocking pandas file I/O
(``read_table_safe`` / ``save_table_safe``) and CPU-bound work. In Starlette a
path operation declared ``async def`` runs directly on the asyncio event loop,
so any blocking call inside it stalls the whole loop and serializes otherwise
concurrent requests. FastAPI instead runs plain ``def`` path operations in an
external threadpool, keeping the loop free.

These tests pin that contract two ways:

1. Structurally: the blocking routes are plain ``def`` (not coroutines), and the
   one route that must stay ``async def`` (``upload_project`` awaits validation)
   offloads its blocking work via ``run_in_threadpool``.
2. Behaviourally: overlapping requests to a route whose read is made slow do not
   serialize, proving the event loop is not blocked while the read runs.
"""

import asyncio
import inspect
import time
import uuid

import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient

from app import models
from app.api.dependencies import get_project_or_404
from app.api.endpoints import profiling, projects, transformations
from app.main import app


def test_blocking_routes_are_sync_def():
    """Routes doing blocking pandas I/O must be plain ``def`` for threadpool offload."""
    blocking_routes = [
        projects.get_project_details,
        projects.save_project,
        projects.revert_to_checkpoint,
        projects.export_project,
        projects.undo_last_transformation,
        transformations.transform_project,
        profiling.get_dataset_summary,
        profiling.get_column_profile,
        profiling.get_all_column_profiles,
        profiling.get_correlation_matrix,
    ]
    offenders = [fn.__name__ for fn in blocking_routes if inspect.iscoroutinefunction(fn)]
    assert not offenders, (
        f"These routes run blocking pandas I/O and must be plain `def` so FastAPI "
        f"runs them in a threadpool instead of on the event loop: {offenders}"
    )


def test_upload_stays_async_and_offloads_blocking_io():
    """``upload_project`` awaits validation, so it stays async but must offload I/O."""
    assert inspect.iscoroutinefunction(projects.upload_project)
    source = inspect.getsource(projects.upload_project)
    assert "run_in_threadpool(store_upload" in source
    assert "run_in_threadpool(read_table_safe" in source


@pytest.mark.asyncio
async def test_slow_read_does_not_block_other_requests(monkeypatch):
    """A slow project read must not serialize concurrent requests.

    ``read_table_safe`` is patched to sleep, and ``get_project_or_404`` is
    overridden so the test needs no database or auth. If the endpoint ran on the
    event loop, five concurrent requests would take ~5x the per-read delay; run
    in a threadpool they overlap and finish in roughly one delay.
    """
    read_delay = 0.4
    concurrency = 5

    def _slow_read(_path):
        time.sleep(read_delay)
        return pd.DataFrame({"a": [1, 2], "b": [3, 4]})

    monkeypatch.setattr(projects, "read_table_safe", _slow_read)

    # A minimal Project the route can serve without a database or auth.
    stub_project = models.Project(
        project_id=uuid.uuid4(),
        name="concurrency-fixture",
        description=None,
        file_path="unused-because-read-is-patched.csv",
        owner_id=uuid.uuid4(),
    )
    app.dependency_overrides[get_project_or_404] = lambda: stub_project
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            pid = uuid.uuid4()
            start = time.perf_counter()
            responses = await asyncio.gather(*(ac.get(f"/projects/get/{pid}") for _ in range(concurrency)))
            elapsed = time.perf_counter() - start
    finally:
        app.dependency_overrides.pop(get_project_or_404, None)

    assert all(r.status_code == 200 for r in responses)
    # Serialized on the event loop would be ~concurrency * read_delay; threadpool
    # overlap keeps it near a single delay. Assert well below the serialized floor.
    assert elapsed < read_delay * concurrency * 0.6, (
        f"{concurrency} concurrent reads took {elapsed:.2f}s (single read {read_delay}s); "
        f"the endpoint appears to block the event loop"
    )
