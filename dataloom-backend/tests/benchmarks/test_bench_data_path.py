"""Benchmarks for dataset I/O, transformations, profiling, and data quality.

Run with ``uv run pytest tests/benchmarks --benchmark-enable --benchmark-only``.
The project config disables timing during a plain ``uv run pytest`` run, which
executes each benchmark once as a smoke test. CI compares matching test names
against ``main``; keep the baseline benchmark names stable.
"""

import shutil
import uuid
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sqlmodel import Session

from app import models
from app.config import get_settings
from app.services import file_service, profiling_service, project_service, quality_service, transformation_service
from app.services.transformation_service import apply_logged_transformation
from app.utils import df_cache, pandas_helpers
from app.utils.file_formats import get_format
from app.utils.project_locks import project_write_lock

ROW_COUNT = 100_000
SEED = 20261006


@pytest.fixture(scope="module")
def benchmark_dataset(tmp_path_factory):
    """Create one deterministic mixed-type CSV outside the measured sections."""
    directory = tmp_path_factory.mktemp("data-path-benchmark")
    path = directory / "mixed.csv"
    frame = pd.DataFrame(
        {
            "row_id": np.arange(ROW_COUNT, dtype=np.int64),
            "amount": np.linspace(0.0, 1_000_000.0, ROW_COUNT),
            "category": np.resize(np.array(["alpha", "beta", "gamma", "delta"]), ROW_COUNT),
            "label": [f"item-{index % 10_000:05d}" for index in range(ROW_COUNT)],
            "event_time": pd.date_range("2020-01-01", periods=ROW_COUNT, freq="min").astype(str),
        }
    )
    frame.to_csv(path, index=False)
    return frame, path


@pytest.fixture(scope="module")
def operations_csv_path(tmp_path_factory):
    """Create the broader, deterministic sales dataset used by service benchmarks."""
    rng = np.random.default_rng(SEED)
    dates = pd.date_range("2020-01-01", periods=2_000, freq="D").strftime("%Y-%m-%d").to_numpy()
    frame = pd.DataFrame(
        {
            "order_id": [f"ORD-{index:07d}" for index in range(ROW_COUNT)],
            "product": rng.choice(["Laptop", "Keyboard", "Monitor", "Mouse", "Headset", "Webcam"], ROW_COUNT),
            "region": rng.choice(["North", "South", "East", "West", "Central"], ROW_COUNT),
            "amount": rng.normal(500, 150, ROW_COUNT).round(2),
            "units": rng.integers(1, 50, ROW_COUNT),
            "order_date": rng.choice(dates, ROW_COUNT),
            "notes": [f"note {index % 997} for customer {index % 4_999}" for index in range(ROW_COUNT)],
        }
    )
    path = tmp_path_factory.mktemp("operations-benchmark") / "orders.csv"
    frame.to_csv(path, index=False)
    return path


@pytest.fixture(scope="module")
def raw_operations_frame(operations_csv_path):
    """Return CSV values before the service's datetime inference step."""
    return get_format(operations_csv_path).read(operations_csv_path)


@pytest.fixture(scope="module")
def operations_frame(operations_csv_path):
    """Return the operations dataset with the same inference used by endpoints."""
    return pandas_helpers.read_table_safe(operations_csv_path, use_cache=False)


@pytest.mark.parametrize("column", ["notes", "order_id", "order_date"])
def test_infer_datetime_columns(benchmark, raw_operations_frame, column):
    result = benchmark(pandas_helpers._infer_datetime_columns, raw_operations_frame[[column]])

    assert result.shape == raw_operations_frame[[column]].shape
    if column == "order_date":
        assert pd.api.types.is_datetime64_any_dtype(result[column])
    else:
        assert not pd.api.types.is_datetime64_any_dtype(result[column])


def test_uncached_dataset_read(benchmark, benchmark_dataset):
    """Measure parsing and datetime inference without consulting the cache."""
    frame, path = benchmark_dataset

    result = benchmark(pandas_helpers.read_table_safe, path, use_cache=False)

    assert result.shape == frame.shape
    assert pd.api.types.is_datetime64_any_dtype(result["event_time"])


def test_read_csv_uncached(benchmark, operations_csv_path):
    result = benchmark(pandas_helpers.read_table_safe, operations_csv_path, use_cache=False)

    assert result.shape == (ROW_COUNT, 7)


def test_cold_cached_dataset_read(benchmark, benchmark_dataset, monkeypatch):
    """Measure initial cache population separately from warm cache hits."""
    frame, path = benchmark_dataset
    parse_calls = []
    original_loader = pandas_helpers._read_and_infer

    def counting_loader(source):
        parse_calls.append(Path(source))
        return original_loader(source)

    monkeypatch.setattr(pandas_helpers, "_read_and_infer", counting_loader)

    result = benchmark.pedantic(
        pandas_helpers.read_table_safe,
        args=(path,),
        setup=df_cache.clear,
        rounds=10,
        warmup_rounds=1,
        iterations=1,
    )

    assert result.shape == frame.shape
    assert len(parse_calls) == (11 if benchmark.enabled else 1)
    df_cache.clear()


def test_warm_cached_dataset_read(benchmark, benchmark_dataset, monkeypatch):
    """Measure valid cache-hit cost, including the cache's defensive copy."""
    expected, path = benchmark_dataset
    df_cache.clear()
    parse_calls = []
    original_loader = pandas_helpers._read_and_infer

    def counting_loader(source):
        parse_calls.append(Path(source))
        return original_loader(source)

    monkeypatch.setattr(pandas_helpers, "_read_and_infer", counting_loader)
    seeded = pandas_helpers.read_table_safe(path)
    assert len(seeded) == ROW_COUNT
    assert parse_calls == [path]

    result = benchmark(pandas_helpers.read_table_safe, path)

    assert len(result) == ROW_COUNT
    assert result.dtypes.equals(seeded.dtypes)
    assert parse_calls == [path]
    assert result is not seeded
    result.loc[0, "row_id"] = -1
    assert pandas_helpers.read_table_safe(path).loc[0, "row_id"] == 0
    assert expected.loc[0, "row_id"] == 0
    df_cache.clear()


def test_atomic_dataset_serialization(benchmark, benchmark_dataset, tmp_path):
    """Measure the production atomic writer against the same 100k-row frame."""
    frame, _ = benchmark_dataset
    destination = tmp_path / "serialized.csv"
    destination.write_text("previous contents\n", encoding="utf-8")

    benchmark(pandas_helpers.save_table_safe, frame, destination)

    actual = pandas_helpers.read_table_safe(destination, use_cache=False)
    assert actual.shape == frame.shape
    assert actual.columns.tolist() == frame.columns.tolist()
    assert actual.loc[0, "row_id"] == 0
    assert actual.loc[ROW_COUNT - 1, "row_id"] == ROW_COUNT - 1
    assert not list(tmp_path.glob(f".{destination.name}.*{destination.suffix}"))


def _prepare_workflow(db: Session, owner_id: uuid.UUID, source_path: Path, upload_dir: Path):
    """Create fresh project state outside the timed workflow."""
    upload_dir.mkdir(parents=True, exist_ok=True)
    working_path = upload_dir / f"{uuid.uuid4().hex}_copy.csv"
    shutil.copyfile(source_path, working_path)
    project = project_service.create_project(
        db,
        name="Dataset I/O benchmark",
        file_path=str(working_path),
        description="Temporary benchmark project",
        owner_id=owner_id,
    )
    return project, working_path


def _run_read_transform_snapshot_write(project: models.Project, db: Session) -> pd.DataFrame:
    """Exercise the real read, sort, byte snapshot, atomic write, and undo log."""
    with project_write_lock(project.project_id):
        source = pandas_helpers.read_table_safe(Path(project.file_path))
        result = transformation_service.apply_sort(source, "row_id", ascending=False)
        project_service.commit_undoable_change(
            db,
            project,
            result,
            [("sort", {"column": "row_id", "ascending": False})],
        )
    return result


def test_read_transform_snapshot_write(benchmark, benchmark_dataset, db, test_user, tmp_path, monkeypatch):
    """Measure an undoable transformation through production service helpers."""
    _, source_path = benchmark_dataset
    upload_dir = tmp_path / "uploads"
    monkeypatch.setattr(get_settings(), "upload_dir", str(upload_dir))

    state = {}

    def setup():
        df_cache.clear()
        project, working_path = _prepare_workflow(db, test_user.id, source_path, upload_dir)
        state.update(project=project, working_path=working_path)
        return (project, db), {}

    def teardown(*_args, **_kwargs):
        project = state.get("project")
        working_path = state.get("working_path")
        if project is not None:
            project_id = project.project_id
            persisted = pandas_helpers.read_table_safe(Path(project.file_path), use_cache=False)
            assert len(persisted) == ROW_COUNT
            assert persisted.iloc[0]["row_id"] == ROW_COUNT - 1
            assert persisted.iloc[-1]["row_id"] == 0
            project_service.delete_project(db, project)
            file_service.delete_project_snapshots(project_id)
        if working_path is not None:
            df_cache.invalidate(working_path)
            working_path.unlink(missing_ok=True)
        shutil.rmtree(upload_dir, ignore_errors=True)
        state.clear()

    if benchmark.enabled:
        result = benchmark.pedantic(
            _run_read_transform_snapshot_write,
            setup=setup,
            teardown=teardown,
            rounds=10,
            warmup_rounds=1,
            iterations=1,
        )
    else:
        setup()
        try:
            result = benchmark(_run_read_transform_snapshot_write, state["project"], db)
        finally:
            teardown()

    assert len(result) == ROW_COUNT
    assert result.iloc[0]["row_id"] == ROW_COUNT - 1
    assert result.iloc[-1]["row_id"] == 0


OPERATIONS = {
    "filter-contains": ("filter", {"parameters": {"column": "notes", "condition": "contains", "value": "customer 42"}}),
    "sort-multi": (
        "sort",
        {"sort_params": {"criteria": [{"column": "region"}, {"column": "amount", "ascending": False}]}},
    ),
    "dropDuplicate": ("dropDuplicate", {"drop_duplicate": {"columns": "product,region", "keep": "first"}}),
    "groupby-mean": (
        "groupby",
        {"groupby_params": {"columns": ["region", "product"], "agg_column": "amount", "agg_function": "mean"}},
    ),
    "pivotTables": (
        "pivotTables",
        {"pivot_query": {"index": "region", "value": "amount", "column": "product", "aggfun": "sum"}},
    ),
}


@pytest.mark.parametrize("operation", OPERATIONS)
def test_operation(benchmark, operations_frame, operation):
    action_type, action_details = OPERATIONS[operation]
    result = benchmark(apply_logged_transformation, operations_frame, action_type, action_details)

    assert isinstance(result, pd.DataFrame)
    assert not result.empty


def test_all_column_profiles(benchmark, operations_frame):
    result = benchmark(profiling_service.all_column_profiles, operations_frame)

    assert len(result["profiles"]) == len(operations_frame.columns)


def test_assess_quality(benchmark, operations_frame):
    result = benchmark(quality_service.assess_quality, operations_frame.head(10_000))

    assert isinstance(result, dict)
