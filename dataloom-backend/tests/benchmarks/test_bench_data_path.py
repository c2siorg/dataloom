"""Benchmarks for the backend data path: datetime inference, file reads, Operations, profiling, quality.

Timing only happens with --benchmark-enable. pyproject's addopts sets --benchmark-disable, so a plain
`uv run pytest` runs each benchmark once as an untimed smoke test. CI compares these against main on
the same runner (.github/workflows/benchmarks.yml), pairing results by test name, so keep names stable.
"""

import numpy as np
import pandas as pd
import pytest

from app.services import profiling_service, quality_service
from app.services.transformation_service import apply_logged_transformation
from app.utils.file_formats import get_format
from app.utils.pandas_helpers import _infer_datetime_columns, read_table_safe

ROWS = 100_000
SEED = 20261006


@pytest.fixture(scope="module")
def csv_path(tmp_path_factory):
    rng = np.random.default_rng(SEED)
    dates = pd.date_range("2020-01-01", periods=2000, freq="D").strftime("%Y-%m-%d").to_numpy()
    df = pd.DataFrame(
        {
            "order_id": [f"ORD-{i:07d}" for i in range(ROWS)],
            "product": rng.choice(["Laptop", "Keyboard", "Monitor", "Mouse", "Headset", "Webcam"], ROWS),
            "region": rng.choice(["North", "South", "East", "West", "Central"], ROWS),
            "amount": rng.normal(500, 150, ROWS).round(2),
            "units": rng.integers(1, 50, ROWS),
            "order_date": rng.choice(dates, ROWS),
            "notes": [f"note {i % 997} for customer {i % 4999}" for i in range(ROWS)],
        }
    )
    path = tmp_path_factory.mktemp("bench") / "orders.csv"
    df.to_csv(path, index=False)
    return path


@pytest.fixture(scope="module")
def raw(csv_path):
    """The frame as the CSV reader returns it, before datetime inference."""
    return get_format(csv_path).read(csv_path)


@pytest.fixture(scope="module")
def frame(csv_path):
    """The frame as the data endpoints see it (after datetime inference)."""
    return read_table_safe(csv_path, use_cache=False)


@pytest.mark.parametrize("column", ["notes", "order_id", "order_date"])
def test_infer_datetime_columns(benchmark, raw, column):
    benchmark(_infer_datetime_columns, raw[[column]])


def test_read_csv_uncached(benchmark, csv_path):
    benchmark(read_table_safe, csv_path, use_cache=False)


OPERATIONS = {
    "filter-contains": ("filter", {"parameters": {"column": "notes", "condition": "contains", "value": "customer 42"}}),
    "sort-multi": (
        "sort",
        {
            "sort_params": {
                "criteria": [{"column": "region", "ascending": True}, {"column": "amount", "ascending": False}]
            }
        },
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


@pytest.mark.parametrize("op", OPERATIONS.keys())
def test_operation(benchmark, frame, op):
    action_type, action_details = OPERATIONS[op]
    benchmark(apply_logged_transformation, frame, action_type, action_details)


def test_all_column_profiles(benchmark, frame):
    benchmark(profiling_service.all_column_profiles, frame)


def test_assess_quality(benchmark, frame):
    # Seconds per call at 100k rows (~348 ms min on 10k rows); 10k keeps multi-round timing fast.
    benchmark(quality_service.assess_quality, frame.head(10_000))
