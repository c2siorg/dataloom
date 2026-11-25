"""HTTP semantics tests for the transform endpoint."""

import csv

import pytest
from fastapi import HTTPException

from app.utils.pandas_helpers import read_table_safe


@pytest.fixture
def project(client, sample_csv):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "HTTP Semantics", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def project_id(project):
    return project["project_id"]


@pytest.fixture
def pagination_project(client, tmp_path):
    """Create a project with 101 rows for pagination testing."""
    csv_path = tmp_path / "pagination_data.csv"

    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "age"])

        for i in range(101):
            writer.writerow([f"User {i}", i])

    with open(csv_path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("pagination_data.csv", f, "text/csv")},
            data={
                "projectName": "Pagination Test",
                "projectDescription": "Pagination fixture",
            },
        )

    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(
    "ascending,expected_ages",
    [
        (True, [25, 30, 30, 35]),
        (False, [35, 30, 30, 25]),
    ],
)
def test_transform_sort_orders_rows(client, project_id, ascending, expected_ages):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "sort",
            "sort_params": {"column": "age", "ascending": ascending},
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()
    age_idx = data["columns"].index("age")
    ages = [int(row[age_idx]) for row in data["rows"]]
    assert ages == expected_ages


def test_transform_add_row_inserts_blank_row_at_index(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "addRow", "row_params": {"index": 1}},
    )

    assert response.status_code == 200, response.text

    data = response.json()
    assert data["row_count"] == 5
    assert len(data["rows"]) == 5
    assert data["rows"][1] == [None, None, None]


def test_transform_del_row_removes_target_row(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "delRow", "row_params": {"index": 1}},
    )

    assert response.status_code == 200, response.text

    data = response.json()
    assert data["row_count"] == 3
    name_idx = data["columns"].index("name")
    names = [row[name_idx] for row in data["rows"]]
    assert "Bob" not in names
    assert names == ["Alice", "Charlie", "Alice"]


def test_transform_del_col_on_last_column_returns_400_and_project_still_loads(client, tmp_path):
    csv_path = tmp_path / "one_column.csv"
    csv_path.write_text("only\n1\n2\n3\n")

    with open(csv_path, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("one_column.csv", f, "text/csv")},
            data={"projectName": "One column", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    project_id = response.json()["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "delCol", "del_col_params": {"index": 0}},
    )
    assert response.status_code == 400, response.text
    assert "only remaining column" in response.json()["detail"]

    # The working copy must be untouched: a later read still succeeds.
    response = client.get(f"/projects/get/{project_id}")
    assert response.status_code == 200, response.text
    assert response.json()["columns"] == ["only"]


def test_transform_rename_col_updates_columns(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "renameCol",
            "rename_col_params": {"col_index": 1, "new_name": "years"},
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()
    assert "years" in data["columns"]
    assert "age" not in data["columns"]


def test_transform_cast_to_datetime_rejects_unparseable_values(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "castDataType",
            "cast_data_type_params": {"column": "city", "target_type": "datetime"},
        },
    )

    assert response.status_code == 400, response.text


def test_transform_cast_to_integer_rejects_unparseable_values(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "castDataType",
            "cast_data_type_params": {"column": "city", "target_type": "integer"},
        },
    )

    assert response.status_code == 400, response.text


def test_transform_cast_numeric_to_datetime_returns_400(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "castDataType",
            "cast_data_type_params": {"column": "age", "target_type": "datetime"},
        },
    )

    assert response.status_code == 400, response.text


def test_transform_unrecognised_operation_type_returns_422(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "bogus"},
    )

    assert response.status_code == 422


def test_transform_missing_project_returns_404(client):
    response = client.post(
        "/projects/00000000-0000-0000-0000-000000000000/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 404


def test_transform_preserves_http_exception_status(client, project_id):
    # Missing filter params should return the explicit 400 from endpoint validation.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "filter"},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Filter parameters required"


def test_transform_maps_transformation_error_to_400(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "missing_column", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 400
    assert "not found" in response.json()["detail"].lower()


def test_transform_cast_to_boolean_rejects_unrecognised_values(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "castDataType",
            "cast_data_type_params": {"column": "city", "target_type": "boolean"},
        },
    )

    assert response.status_code == 400, response.text
    assert "cannot interpret" in response.json()["detail"].lower()


def test_transform_filter_nan_value_returns_400(client, project_id):
    # NaN never equals anything, so filtering a numeric column for "nan"
    # would silently return no rows instead of the missing-value rows.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "age", "condition": "=", "value": "nan"},
        },
    )

    assert response.status_code == 400, response.text
    assert "Invalid numeric value" in response.json()["detail"]


def test_transform_change_cell_int64_overflow_returns_400(client, project_id):
    # Editing the int "age" column (col_index 2) to 2**63 used to return
    # HTTP 500: pandas raised an uncaught AssertionError on assignment.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "changeCellValue",
            "change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": 9223372036854775808},
        },
    )

    assert response.status_code == 400, response.text
    assert "out of range" in response.json()["detail"]


def test_transform_redacts_file_not_found_path_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(status_code=404, detail="File not found: /tmp/private/uploads/project.csv")

    monkeypatch.setattr(transformations_endpoint, "read_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "File not found"


def test_transform_redacts_internal_http_exception_detail(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise HTTPException(
            status_code=500,
            detail="Error reading CSV: [Errno 13] Permission denied: /tmp/private/uploads/project.csv",
        )

    monkeypatch.setattr(transformations_endpoint, "read_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"


def test_transform_redacts_sensitive_transformation_error_message(client, project_id, monkeypatch):
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise transformations_endpoint.ts.TransformationError(
            "SQL failure: SELECT * FROM users WHERE password = 'secret'"
        )

    monkeypatch.setattr(transformations_endpoint.ts, "apply_filter", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid transformation request"


@pytest.mark.parametrize(
    "add_col_params",
    [
        {"index": 1},
        {"index": 1, "name": None},
        {"index": 1, "name": "   "},
    ],
)
def test_transform_add_col_without_valid_name_returns_422(client, project_id, add_col_params):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "addCol", "add_col_params": add_col_params},
    )

    assert response.status_code == 422


def test_transform_drop_duplicate_keep_true_returns_422(client, project_id):
    # keep=True passes schema typing (DropDup | bool) but pandas rejects it;
    # it must be a clean 422, not an Internal server error 500.
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "dropDuplicate", "drop_duplicate": {"columns": "name", "keep": True}},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("keep", ["first", "last", False])
def test_transform_drop_duplicate_valid_keep_succeeds(client, project_id, keep):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "dropDuplicate", "drop_duplicate": {"columns": "name", "keep": keep}},
    )

    assert response.status_code == 200, response.text


def test_transform_returns_500_on_unexpected_exception(client, project_id, monkeypatch):
    # Patch the endpoint's imported service module to force an unexpected crash.
    from app.api.endpoints import transformations as transformations_endpoint

    def boom(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(transformations_endpoint.ts, "apply_filter", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "name", "condition": "=", "value": "Alice"},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"


def test_transform_returns_500_on_unexpected_exception_during_persistence(client, project_id, monkeypatch):
    from app.services import project_service

    calls = []

    def boom(*args, **kwargs):
        calls.append((args, kwargs))
        raise RuntimeError("disk error")

    # This path runs only for mutating operations (should_save=True).
    monkeypatch.setattr(project_service, "save_table_safe", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"
    assert calls, "save_table_safe was never called; persistence path may not have been exercised"


def test_transform_reverts_file_if_log_transformation_fails(client, project, monkeypatch):
    project_id = project["project_id"]
    file_path = project["file_path"]
    original_df = read_table_safe(file_path)

    from app.services import project_service

    def boom(*args, **kwargs):
        raise RuntimeError("db log failure")

    monkeypatch.setattr(project_service, "_add_log_rows", boom)

    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "addRow",
            "row_params": {"index": 0},
        },
    )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"

    restored_df = read_table_safe(file_path)
    assert restored_df.equals(original_df)


@pytest.mark.parametrize(
    "extra_params, condition, value, expected",
    [
        pytest.param(
            {"page": 1, "page_size": 50},
            ">=",
            "0",
            {
                "total_rows": 101,
                "total_pages": 3,
                "page": 1,
                "page_size": 50,
                "row_count": 50,
                "first_row": ["User 0", 0],
                "last_row": ["User 49", 49],
            },
            id="first_page",
        ),
        pytest.param(
            {"page": 2, "page_size": 50},
            ">=",
            "0",
            {
                "total_rows": 101,
                "total_pages": 3,
                "page": 2,
                "page_size": 50,
                "row_count": 50,
                "first_row": ["User 50", 50],
                "last_row": ["User 99", 99],
            },
            id="second_page",
        ),
        pytest.param(
            {"page": 3, "page_size": 50},
            ">=",
            "0",
            {
                "total_rows": 101,
                "total_pages": 3,
                "page": 3,
                "page_size": 50,
                "row_count": 1,
                "first_row": ["User 100", 100],
                "last_row": ["User 100", 100],
            },
            id="partial_last_page",
        ),
        pytest.param(
            {"page": 999, "page_size": 50},
            ">=",
            "0",
            {
                "total_rows": 101,
                "total_pages": 3,
                # Page 999 is clamped to the last valid page.
                "page": 3,
                "page_size": 50,
                "row_count": 1,
                "first_row": ["User 100", 100],
                "last_row": ["User 100", 100],
            },
            id="clamps_out_of_range_page",
        ),
        pytest.param(
            {"page": 2, "page_size": 50},
            "<",
            "100",
            {
                # The filter produces exactly 100 rows.
                "total_rows": 100,
                "total_pages": 2,
                "page": 2,
                "page_size": 50,
                "row_count": 50,
                "first_row": ["User 50", 50],
                "last_row": ["User 99", 99],
            },
            id="exactly_divisible_by_page_size",
        ),
        pytest.param(
            {"page": 1, "page_size": 100},
            ">=",
            "0",
            {
                "total_rows": 101,
                "total_pages": 2,
                "page": 1,
                "page_size": 100,
                "row_count": 100,
                "first_row": ["User 0", 0],
                "last_row": ["User 99", 99],
            },
            id="page_size_100_boundary",
        ),
        pytest.param(
            {},
            ">=",
            "0",
            {
                # Default page=1 and page_size=50.
                "total_rows": 101,
                "total_pages": 3,
                "page": 1,
                "page_size": 50,
                "row_count": 50,
                "first_row": ["User 0", 0],
                "last_row": ["User 49", 49],
            },
            id="defaults_to_first_page",
        ),
    ],
)
def test_transform_preview_pagination(client, pagination_project, extra_params, condition, value, expected):
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={"preview": "true", **extra_params},
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": condition,
                "value": value,
            },
        },
    )

    assert response.status_code == 200, response.text

    data = response.json()

    assert data["total_rows"] == expected["total_rows"]
    assert data["total_pages"] == expected["total_pages"]
    assert data["page"] == expected["page"]
    assert data["page_size"] == expected["page_size"]

    assert data["row_count"] == expected["row_count"]
    assert len(data["rows"]) == expected["row_count"]

    assert data["rows"][0] == expected["first_row"]
    assert data["rows"][-1] == expected["last_row"]


@pytest.mark.parametrize(
    "invalid_params",
    [
        pytest.param({"page": 0, "page_size": 50}, id="page_below_minimum"),
        pytest.param({"page": 1, "page_size": 0}, id="page_size_below_minimum"),
        pytest.param({"page": 1, "page_size": 101}, id="page_size_above_maximum"),
    ],
)
def test_transform_preview_rejects_out_of_bounds_query_params(client, pagination_project, invalid_params):
    # page and page_size must be at least 1; page_size is also capped at 100.
    project_id = pagination_project["project_id"]

    response = client.post(
        f"/projects/{project_id}/transform",
        params={"preview": "true", **invalid_params},
        json={
            "operation_type": "filter",
            "parameters": {
                "column": "age",
                "condition": ">=",
                "value": "0",
            },
        },
    )

    assert response.status_code == 422


def test_transform_groupby_rejects_group_column_as_agg_column(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "groupby",
            "groupby_params": {"columns": ["city"], "agg_column": "city", "agg_function": "count"},
        },
    )

    assert response.status_code == 400, response.text
    assert "group-by column" in response.json()["detail"]


def test_transform_groupby_rejects_non_numeric_aggregation(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "groupby",
            "groupby_params": {"columns": ["city"], "agg_column": "name", "agg_function": "mean"},
        },
    )

    assert response.status_code == 400, response.text
    assert "Cannot aggregate column" in response.json()["detail"]


def test_transform_groupby_rejects_sum_on_text_column(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "groupby",
            "groupby_params": {"columns": ["city"], "agg_column": "name", "agg_function": "sum"},
        },
    )

    assert response.status_code == 400, response.text
    assert "Cannot sum text column" in response.json()["detail"]


def test_transform_pivot_rejects_value_as_index_column(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "age", "value": "age", "aggfun": "sum"},
        },
    )

    assert response.status_code == 400, response.text
    assert "cannot also be an index column" in response.json()["detail"]


def test_transform_pivot_rejects_pivot_column_as_index_column(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "city", "column": "city", "value": "age", "aggfun": "sum"},
        },
    )

    assert response.status_code == 400, response.text
    assert "cannot also be an index column" in response.json()["detail"]


def test_transform_pivot_rejects_pivot_column_as_value_column(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "city", "column": "age", "value": "age", "aggfun": "sum"},
        },
    )

    assert response.status_code == 400, response.text
    assert "cannot also be the value column" in response.json()["detail"]


def test_transform_pivot_rejects_empty_index(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "   ", "value": "age", "aggfun": "sum"},
        },
    )

    assert response.status_code == 400, response.text
    assert "At least one index column is required" in response.json()["detail"]


def test_transform_pivot_rejects_non_numeric_aggregation(client, project_id):
    response = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "city", "value": "name", "aggfun": "mean"},
        },
    )

    assert response.status_code == 400, response.text
    assert "Cannot aggregate column" in response.json()["detail"]


def test_transform_fill_mean_on_datetime_column_returns_400(client, tmp_path):
    """fillEmpty mean on a date column must not silently write a nanosecond
    count into it: a CSV date column with one empty cell is inferred as
    datetime, and the old to_numeric guard let it through (HTTP 200, the
    missing date became -3.07e18 and the column flipped to str)."""
    csv_path = tmp_path / "dates.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["when", "val"])
        writer.writerow(["2024-01-01", "1"])
        writer.writerow(["", "2"])
        writer.writerow(["2024-01-03", "3"])
    with open(csv_path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("dates.csv", f, "text/csv")},
            data={"projectName": "Dates", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]
    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "fillEmpty",
            "fill_empty_params": {"index": 0, "strategy": "mean"},
        },
    )
    assert response.status_code == 400, response.text
    assert "non-numeric" in response.json()["detail"]


def test_transform_fill_custom_text_on_numeric_column_returns_400(client, tmp_path):
    """fillEmpty custom with a text value on a numeric column must not
    silently rewrite the column as object dtype: a CSV score column with one
    empty cell is read as float, and the old code filled it with the string
    (HTTP 200, the column flipped to mixed types)."""
    csv_path = tmp_path / "scores.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["score", "name"])
        writer.writerow(["10", "a"])
        writer.writerow(["", "b"])
        writer.writerow(["30", "c"])
    with open(csv_path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("scores.csv", f, "text/csv")},
            data={"projectName": "Scores", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]
    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "fillEmpty",
            "fill_empty_params": {"index": 0, "fill_value": "abc", "strategy": "custom"},
        },
    )
    assert response.status_code == 400, response.text
    assert "non-numeric" in response.json()["detail"]


def test_transform_fill_custom_list_value_returns_400(client, tmp_path):
    """A JSON array as a custom fill value reached fillna() and raised a raw
    TypeError, answered as HTTP 500. It must be a 400 instead."""
    csv_path = tmp_path / "names.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name"])
        writer.writerow(["a"])
        writer.writerow([""])
    with open(csv_path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("names.csv", f, "text/csv")},
            data={"projectName": "Names", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]
    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "fillEmpty",
            "fill_empty_params": {"index": 0, "fill_value": ["x"], "strategy": "custom"},
        },
    )
    assert response.status_code == 400, response.text
    assert "single value" in response.json()["detail"]


def test_transform_cell_edit_with_list_value_on_mixed_column_returns_400(client, tmp_path):
    """A JSON array as a cell value on a mixed-type (object-dtype) column was
    accepted and echoed back as a list, but saved as its string form on
    reload — the edit did not round-trip. It must be a 400 instead."""
    import json

    path = tmp_path / "mixed.json"
    path.write_text(json.dumps([{"m": 1, "v": 10}, {"m": "two", "v": 20}, {"m": 3, "v": 30}]))
    with open(path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("mixed.json", f, "application/json")},
            data={"projectName": "Mixed", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]
    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "changeCellValue",
            "change_cell_value": {"row_index": 0, "col_index": 1, "fill_value": ["x"]},
        },
    )
    assert response.status_code == 400, response.text
    assert "single value" in response.json()["detail"]


def test_transform_pivot_with_colliding_column_values_returns_400(client, tmp_path):
    """A JSON upload whose records disagree on a key's type leaves a mixed
    pivot column (1 and "1"). Pivoting on it used to succeed with two columns
    both named "1" — an ambiguous dataset where deleting one column deleted
    both. It must be a 400 instead."""
    import json

    path = tmp_path / "mixed.json"
    path.write_text(
        json.dumps(
            [
                {"grp": "x", "cat": 1, "v": 10},
                {"grp": "x", "cat": "1", "v": 20},
                {"grp": "x", "cat": 1, "v": 30},
            ]
        )
    )
    with open(path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("mixed.json", f, "application/json")},
            data={"projectName": "Mixed", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]
    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "pivotTables",
            "pivot_query": {"index": "grp", "column": "cat", "value": "v", "aggfun": "sum"},
        },
    )
    assert response.status_code == 400, response.text
    assert "duplicate column names" in response.json()["detail"]


@pytest.mark.parametrize("strategy", ["mean", "median"])
def test_transform_fill_empty_stat_on_parquet_nullable_int64_returns_200(client, tmp_path, strategy):
    """Parquet uploads preserve nullable Int64; fractional mean/median fills must succeed, not 500."""
    import pandas as pd

    parquet_path = tmp_path / "nullable_ints.parquet"
    pd.DataFrame({"val": pd.Series([1, 2, pd.NA], dtype="Int64")}).to_parquet(parquet_path, index=False)
    with open(parquet_path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("nullable_ints.parquet", f, "application/octet-stream")},
            data={"projectName": f"Parquet {strategy}", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]

    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "fillEmpty",
            "fill_empty_params": {"index": 0, "strategy": strategy},
        },
    )
    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [row[0] for row in rows] == [1.0, 2.0, 1.5]


def test_transform_handle_outliers_clip_on_parquet_nullable_int64_returns_200(client, tmp_path):
    """Parquet uploads preserve nullable Int64; clipping to fractional IQR fences must succeed, not 500."""
    import pandas as pd

    parquet_path = tmp_path / "nullable_outliers.parquet"
    pd.DataFrame({"val": pd.Series([1, 2, 3, 5, 100, pd.NA], dtype="Int64")}).to_parquet(parquet_path, index=False)
    with open(parquet_path, "rb") as f:
        upload = client.post(
            "/projects/upload",
            files={"file": ("nullable_outliers.parquet", f, "application/octet-stream")},
            data={"projectName": "Parquet Outliers", "projectDescription": "fixture"},
        )
    assert upload.status_code == 200, upload.text
    pid = upload.json()["project_id"]

    response = client.post(
        f"/projects/{pid}/transform",
        json={
            "operation_type": "handleOutliers",
            "outlier_params": {"column": "val", "method": "iqr", "action": "clip"},
        },
    )
    assert response.status_code == 200, response.text
    rows = response.json()["rows"]
    assert [row[0] for row in rows] == [1.0, 2.0, 3.0, 5.0, 9.5, None]
