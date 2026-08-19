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
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient

from app import models, schemas
from app.api.dependencies import get_project_or_404, load_project_df
from app.api.endpoints import profiling, projects, transformations
from app.main import app
from app.utils.project_locks import project_write_lock


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


def test_concurrent_transforms_for_same_project_do_not_lose_updates(monkeypatch):
    project_id = uuid.uuid4()
    project = models.Project(
        project_id=project_id,
        name="concurrency-fixture",
        file_path="unused.csv",
        owner_id=uuid.uuid4(),
    )
    transformation_input = schemas.TransformationInput(operation_type=schemas.OperationType.dropNa)
    current = pd.DataFrame({"value": [0]})
    first_read = threading.Event()
    reads = 0

    def _read(_path):
        nonlocal reads
        reads += 1
        if reads == 1:
            first_read.set()
            time.sleep(0.1)
        return current.copy()

    def _transform(df, _input):
        result = df.copy()
        result.loc[0, "value"] += 1
        return result

    def _save(df, _path):
        nonlocal current
        current = df.copy()

    monkeypatch.setattr(transformations, "read_table_safe", _read)
    monkeypatch.setattr(transformations, "_dispatch_transform", _transform)
    monkeypatch.setattr(transformations, "save_table_safe", _save)
    monkeypatch.setattr(transformations, "log_transformations_or_restore", lambda *_args: None)

    def _call_transform():
        return transformations.transform_project(project_id, transformation_input, False, 1, 50, object(), project)

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(_call_transform)
        assert first_read.wait(timeout=1)
        second = executor.submit(_call_transform)
        first.result(timeout=2)
        second.result(timeout=2)

    assert current["value"].tolist() == [2]


def test_same_project_read_does_not_observe_torn_write(tmp_path):
    """Readers of project.file_path must wait for an in-flight writer.

    Format writers truncate the destination in place. If get_project_details,
    preview transform, or load_project_df skipped the lock, they could parse
    the empty file mid-write.
    """
    path = tmp_path / "data.csv"
    path.write_text("value\n1\n")
    project_id = uuid.uuid4()
    project = models.Project(
        project_id=project_id,
        name="torn-write-fixture",
        file_path=str(path),
        owner_id=uuid.uuid4(),
    )
    write_started = threading.Event()
    allow_finish = threading.Event()

    def _writer():
        with project_write_lock(project_id):
            path.write_text("")
            write_started.set()
            assert allow_finish.wait(timeout=2)
            path.write_text("value\n2\n")

    def _read_details():
        return projects.get_project_details(page=1, pageSize=50, project=project)

    def _preview():
        return transformations.transform_project(
            project_id,
            schemas.TransformationInput(
                operation_type=schemas.OperationType.dropNa,
                drop_na_params=schemas.DropNaParams(),
            ),
            True,
            1,
            50,
            object(),
            project,
        )

    def _profile_read():
        return load_project_df(project)

    with ThreadPoolExecutor(max_workers=4) as executor:
        writer = executor.submit(_writer)
        assert write_started.wait(timeout=1)
        details = executor.submit(_read_details)
        preview = executor.submit(_preview)
        profile = executor.submit(_profile_read)
        time.sleep(0.05)
        assert not details.done()
        assert not preview.done()
        assert not profile.done()
        allow_finish.set()
        writer.result(timeout=2)
        details_resp = details.result(timeout=2)
        preview_resp = preview.result(timeout=2)
        profile_df = profile.result(timeout=2)

    assert details_resp["rows"] == [[2]]
    assert preview_resp["rows"] == [[2]]
    assert profile_df["value"].tolist() == [2]
    assert Path(path).read_text() == "value\n2\n"


@pytest.mark.asyncio
async def test_slow_read_does_not_block_other_requests(monkeypatch):
    """A slow project read must not serialize concurrent requests.

    ``read_table_safe`` is patched to sleep, and ``get_project_or_404`` is
    overridden so the test needs no database or auth. Each request uses a
    distinct project_id so the per-project lock does not serialize them. If
    the endpoint ran on the event loop, five concurrent requests would take
    ~5x the per-read delay; run in a threadpool they overlap and finish in
    roughly one delay.
    """
    read_delay = 0.4
    concurrency = 5

    def _slow_read(_path):
        time.sleep(read_delay)
        return pd.DataFrame({"a": [1, 2], "b": [3, 4]})

    monkeypatch.setattr(projects, "read_table_safe", _slow_read)

    def _project_for_request(project_id: uuid.UUID):
        return models.Project(
            project_id=project_id,
            name="concurrency-fixture",
            description=None,
            file_path="unused-because-read-is-patched.csv",
            owner_id=uuid.uuid4(),
        )

    app.dependency_overrides[get_project_or_404] = _project_for_request
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            pids = [uuid.uuid4() for _ in range(concurrency)]
            start = time.perf_counter()
            responses = await asyncio.gather(*(ac.get(f"/projects/get/{pid}") for pid in pids))
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
