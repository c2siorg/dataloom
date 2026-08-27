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

import ast
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
from app.api import dependencies, endpoints
from app.api.dependencies import get_project_or_404, load_project_df
from app.api.endpoints import pipelines, profiling, project_files, projects, transformations
from app.main import app
from app.utils import project_locks
from app.utils.project_locks import project_read_lock, project_write_lock


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
            # Snapshot *before* stalling: the point of the test is that the slow
            # caller holds pre-transform data while the other one races ahead.
            # Reading after the sleep would pick up the second write and the
            # test would pass even with no lock at all.
            stale = current.copy()
            first_read.set()
            time.sleep(0.1)
            return stale
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


def _async_route_offload_offenders() -> list[str]:
    """Find ``async def`` routes that reach blocking work without offloading it.

    A blocking call inside an ``async def`` path operation runs on the event
    loop and stalls every other request. Worse, ``load_project_df`` and the
    ``project_*_lock`` helpers block waiting on another *thread*, so an async
    route that touches them freezes the whole server for every project until
    the holder finishes.

    The check is deliberately structural rather than name-based on two known
    modules, so a new endpoint cannot reintroduce the bug somewhere else.
    """
    blocking = {
        # pandas file I/O
        "read_table_safe",
        "save_table_safe",
        "load_project_df",
        "read_project_df",
        "store_upload",
        "store_added_file",
        "_read_upload_df",
        "_preview_append",
        "_append_and_log",
        # helpers that block on the per-project lock
        "project_read_lock",
        "project_write_lock",
    }

    offenders: list[str] = []
    scanned_async_routes = 0
    for path in sorted(Path(endpoints.__file__).parent.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            is_route = any(
                isinstance(dec, ast.Call)
                and isinstance(dec.func, ast.Attribute)
                and isinstance(dec.func.value, ast.Name)
                and dec.func.value.id == "router"
                for dec in node.decorator_list
            )
            if not is_route:
                continue
            scanned_async_routes += 1

            # Names handed to run_in_threadpool are offloaded, so they are fine.
            offloaded = {
                call.args[0]
                for call in ast.walk(node)
                if isinstance(call, ast.Call)
                and isinstance(call.func, ast.Name)
                and call.func.id == "run_in_threadpool"
                and call.args
            }
            for child in ast.walk(node):
                if isinstance(child, ast.Name) and child.id in blocking and child not in offloaded:
                    offenders.append(f"{path.name}:{child.lineno} {node.name} -> {child.id}")

    # Guard against the check silently scanning nothing and passing vacuously.
    assert scanned_async_routes >= 3, f"expected to scan several async routes, saw {scanned_async_routes}"
    return offenders


def test_async_routes_offload_all_blocking_work():
    """No ``async def`` route may call blocking I/O or the project lock directly."""
    offenders = _async_route_offload_offenders()
    assert not offenders, (
        "These async routes run blocking work on the event loop. Either make the "
        "route a plain `def` (FastAPI will run it in its threadpool) or wrap the "
        "call in run_in_threadpool:\n  " + "\n  ".join(offenders)
    )


def test_concurrent_reads_of_one_project_overlap(monkeypatch):
    """The project lock must be shared for readers, not mutually exclusive.

    The UI opens several profiling panels for one project at once. If reads took
    an exclusive lock they would queue behind each other and the threadpool win
    would be lost for the most common multi-widget load.

    The barrier makes this deterministic rather than wall-clock based: it only
    releases once all three reads are inside ``read_table_safe`` simultaneously,
    so a serializing lock fails with BrokenBarrierError instead of a slow pass.
    """
    readers = 3
    barrier = threading.Barrier(readers, timeout=5)
    project = models.Project(
        project_id=uuid.uuid4(),
        name="shared-read-fixture",
        file_path="unused.csv",
        owner_id=uuid.uuid4(),
    )

    def _read(_path):
        barrier.wait()
        return pd.DataFrame({"value": [1]})

    monkeypatch.setattr(dependencies, "read_table_safe", _read)

    with ThreadPoolExecutor(max_workers=readers) as executor:
        futures = [executor.submit(load_project_df, project) for _ in range(readers)]
        frames = [f.result(timeout=5) for f in futures]

    assert all(frame["value"].tolist() == [1] for frame in frames)


def test_writes_to_different_projects_overlap():
    """The lock is per project: two projects must never wait on each other."""
    writers = 2
    barrier = threading.Barrier(writers, timeout=5)

    def _write(project_id: uuid.UUID) -> bool:
        with project_write_lock(project_id):
            barrier.wait()
            return True

    with ThreadPoolExecutor(max_workers=writers) as executor:
        futures = [executor.submit(_write, uuid.uuid4()) for _ in range(writers)]
        assert all(f.result(timeout=5) for f in futures)


def test_waiting_writer_blocks_new_readers():
    """A waiting writer takes priority, so a read stream cannot starve a save.

    Without writer preference, DataLoom's own polling profiling panels could
    keep the shared lock permanently occupied and a save would never acquire it.
    """
    project_id = uuid.uuid4()
    order: list[str] = []
    order_lock = threading.Lock()
    reader_holding = threading.Event()
    release_reader = threading.Event()

    def _record(label: str) -> None:
        with order_lock:
            order.append(label)

    def _first_reader():
        with project_read_lock(project_id):
            reader_holding.set()
            assert release_reader.wait(timeout=5)
        _record("reader-1")

    def _writer():
        with project_write_lock(project_id):
            _record("writer")

    def _late_reader():
        with project_read_lock(project_id):
            _record("reader-2")

    with ThreadPoolExecutor(max_workers=3) as executor:
        first = executor.submit(_first_reader)
        assert reader_holding.wait(timeout=5)

        writer = executor.submit(_writer)
        # Wait until the writer is actually queued, rather than sleeping blindly.
        deadline = time.perf_counter() + 5
        lock = project_locks._project_locks[project_id][0]
        while lock._writers_waiting == 0 and time.perf_counter() < deadline:
            time.sleep(0.005)
        assert lock._writers_waiting == 1

        late = executor.submit(_late_reader)
        # The late reader must queue behind the writer even though the lock is
        # currently held in shared mode and it could otherwise join in.
        time.sleep(0.05)
        assert not late.done()

        release_reader.set()
        first.result(timeout=5)
        writer.result(timeout=5)
        late.result(timeout=5)

    assert order == ["reader-1", "writer", "reader-2"]


def test_locks_are_released_from_the_registry():
    """Held locks are reference-counted so a long-lived process cannot leak them."""
    project_id = uuid.uuid4()
    with project_read_lock(project_id):
        assert project_id in project_locks._project_locks
    assert project_id not in project_locks._project_locks

    with project_write_lock(project_id):
        assert project_id in project_locks._project_locks
    assert project_id not in project_locks._project_locks


def _append_fixture(monkeypatch):
    """Wire _append_and_log onto an in-memory 'file' shared by both callers."""
    project = models.Project(
        project_id=uuid.uuid4(),
        name="append-fixture",
        file_path="unused.csv",
        owner_id=uuid.uuid4(),
    )
    state = {"current": pd.DataFrame({"value": [0]}), "reads": 0}
    first_read = threading.Event()

    def _read_working_copy(_project):
        state["reads"] += 1
        if state["reads"] == 1:
            # Snapshot before stalling, so the slow caller really does hold
            # stale data; reading after the sleep would mask a lost update.
            stale = state["current"].copy()
            first_read.set()
            time.sleep(0.1)
            return stale
        return state["current"].copy()

    def _read_stored(_path):
        return pd.DataFrame({"value": [1]})

    def _save(df, _path):
        state["current"] = df.copy()

    monkeypatch.setattr(project_files, "read_project_df", _read_working_copy)
    monkeypatch.setattr(project_files, "read_table_safe", _read_stored)
    monkeypatch.setattr(project_files, "save_table_safe", _save)
    monkeypatch.setattr(project_files, "log_transformation", lambda *args, **kwargs: None)
    return project, state, first_read


def test_concurrent_appends_for_same_project_do_not_lose_rows(monkeypatch):
    """_append_and_log is a read-modify-write and must hold the exclusive lock.

    Unlocked, the second append reads the pre-append working copy while the
    first one is still mid-flight, so its save discards the first one's rows.
    """
    project, state, first_read = _append_fixture(monkeypatch)

    def _call():
        return project_files._append_and_log(object(), project, "stored.csv", "stored.csv", uuid.uuid4())

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(_call)
        assert first_read.wait(timeout=1)
        second = executor.submit(_call)
        first.result(timeout=5)
        second.result(timeout=5)

    # One starting row plus one row from each of the two appends.
    assert state["current"]["value"].tolist() == [0, 1, 1]


def test_reader_waits_for_an_in_flight_append(tmp_path):
    """An append rewrites the working copy, so readers must not see it mid-write."""
    path = tmp_path / "data.csv"
    path.write_text("value\n1\n")
    project = models.Project(
        project_id=uuid.uuid4(),
        name="append-torn-write-fixture",
        file_path=str(path),
        owner_id=uuid.uuid4(),
    )
    write_started = threading.Event()
    allow_finish = threading.Event()

    def _slow_append():
        # Stand in for _append_and_log's body: the lock is what is under test.
        with project_write_lock(project.project_id):
            path.write_text("")
            write_started.set()
            assert allow_finish.wait(timeout=5)
            path.write_text("value\n1\n2\n")

    with ThreadPoolExecutor(max_workers=2) as executor:
        writer = executor.submit(_slow_append)
        assert write_started.wait(timeout=5)
        reader = executor.submit(load_project_df, project)
        time.sleep(0.05)
        assert not reader.done()
        allow_finish.set()
        writer.result(timeout=5)
        df = reader.result(timeout=5)

    assert df["value"].tolist() == [1, 2]


def test_concurrent_pipeline_applies_do_not_lose_updates(monkeypatch):
    """apply_pipeline reads then writes the working copy under one lock.

    Reading through load_project_df and writing afterwards would release the
    lock in between, letting a second apply read stale data and clobber the
    first one's result.
    """
    project_id = uuid.uuid4()
    project = models.Project(
        project_id=project_id,
        name="pipeline-fixture",
        file_path="unused.csv",
        owner_id=uuid.uuid4(),
    )
    state = {"current": pd.DataFrame({"value": [0]}), "reads": 0}
    first_read = threading.Event()

    def _read_working_copy(_project):
        state["reads"] += 1
        if state["reads"] == 1:
            # Snapshot before stalling, so the slow caller really does hold
            # stale data; reading after the sleep would mask a lost update.
            stale = state["current"].copy()
            first_read.set()
            time.sleep(0.1)
            return stale
        return state["current"].copy()

    def _apply(_db, _project, _pipeline, df):
        result = df.copy()
        result.loc[0, "value"] += 1
        state["current"] = result.copy()
        return result

    monkeypatch.setattr(pipelines, "fetch_owned_pipeline", lambda *args, **kwargs: object())
    monkeypatch.setattr(pipelines, "fetch_owned_project", lambda *args, **kwargs: project)
    monkeypatch.setattr(pipelines, "read_project_df", _read_working_copy)
    monkeypatch.setattr(pipelines.pipeline_service, "apply_pipeline_to_project", _apply)

    body = schemas.PipelineApplyRequest(project_id=project_id)

    def _call():
        return pipelines.apply_pipeline(uuid.uuid4(), body, object(), object())

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(_call)
        assert first_read.wait(timeout=1)
        second = executor.submit(_call)
        first.result(timeout=5)
        second.result(timeout=5)

    assert state["current"]["value"].tolist() == [2]
