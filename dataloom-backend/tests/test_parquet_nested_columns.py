"""Parquet list/struct columns must not crash downstream aggregation.

Parquet is the one supported upload format that can carry nested values into
a DataFrame: pyarrow reads a list column back as numpy arrays and a struct
column back as dicts, both unhashable. Profiling (value_counts), quality
checks (duplicated) and bar charts (groupby) all hash cell values, so before
the read-layer fix every one of them raised a raw TypeError (HTTP 500) on a
project that had uploaded successfully. Nested cells are scalarised to their
JSON-string representation at read time, exactly as the JSON reader already
does for arrays, so the scalar columns in the same file are untouched.
"""

from io import BytesIO

import pyarrow as pa
import pyarrow.parquet as pq

from app.services import profiling_service, quality_service, visualization_service
from app.utils.pandas_helpers import read_table_safe


def _nested_parquet_bytes() -> bytes:
    table = pa.table(
        {
            "tags": [[1, 2], [3], [1, 2]],
            "n": [1, 2, 3],
            "meta": [{"a": 1}, {"a": 2}, {"a": 1}],
        }
    )
    buf = BytesIO()
    pq.write_table(table, buf)
    return buf.getvalue()


def _upload_nested(client):
    response = client.post(
        "/projects/upload",
        files={"file": ("nested.parquet", _nested_parquet_bytes(), "application/octet-stream")},
        data={"projectName": "Nested", "projectDescription": "parquet list/struct test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


def test_read_scalarises_nested_cells_and_leaves_scalars_alone(tmp_path):
    path = tmp_path / "nested.parquet"
    path.write_bytes(_nested_parquet_bytes())

    df = read_table_safe(path, use_cache=False)

    assert df["tags"].tolist() == ["[1, 2]", "[3]", "[1, 2]"]
    assert df["meta"].tolist() == ['{"a": 1}', '{"a": 2}', '{"a": 1}']
    assert df["n"].tolist() == [1, 2, 3]


def test_nested_columns_profile_assess_and_chart(tmp_path):
    path = tmp_path / "nested.parquet"
    path.write_bytes(_nested_parquet_bytes())
    df = read_table_safe(path, use_cache=False)

    profile = profiling_service.column_profile(df, "tags")
    assert profile["unique_count"] == 2
    assert profile["top_values"][0] == {"value": "[1, 2]", "count": 2, "percentage": 66.6667}

    assert quality_service.assess_quality(df)["issue_count"] == 0
    assert profiling_service.dataset_summary(df)["duplicate_row_count"] == 0

    bar = visualization_service.build_bar_chart(df, "tags", None, "count")
    assert bar["series"][0]["data"] == [{"x": "[1, 2]", "y": 2.0}, {"x": "[3]", "y": 1.0}]
    assert visualization_service.suggest_charts(df)


def test_upload_nested_parquet_then_profile_quality_and_charts(client):
    project_id = _upload_nested(client)

    summary = client.get(f"/projects/{project_id}/profile/summary")
    assert summary.status_code == 200, summary.text
    assert summary.json()["row_count"] == 3
    assert summary.json()["column_count"] == 3

    quality = client.post(f"/projects/{project_id}/quality", json={})
    assert quality.status_code == 200, quality.text

    suggest = client.get(f"/projects/{project_id}/charts/suggest")
    assert suggest.status_code == 200, suggest.text

    bar = client.get(
        f"/projects/{project_id}/charts",
        params={"chart_type": "bar", "category": "tags", "agg": "count"},
    )
    assert bar.status_code == 200, bar.text
    assert bar.json()["series"][0]["data"][0]["x"] == "[1, 2]"
