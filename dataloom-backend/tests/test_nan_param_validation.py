"""NaN literals in numeric params must return 422, never an unhandled 500.

Pydantic lets NaN/Inf floats through and the 422 error payload echoes the raw
input; Starlette's JSON encoder then crashes rendering the response itself.
See issue #738.
"""

import json

import pytest


@pytest.fixture
def numeric_project(client, monkeypatch):
    """Upload a small CSV with a numeric column and return its project id."""
    monkeypatch.setattr("os.fsync", lambda fd: None)
    csv_data = "Name,Score,Total\nA,1,10\nB,2,20\nC,3,30\n"
    res = client.post(
        "/projects/upload",
        files={"file": ("nan_test.csv", csv_data.encode("utf-8"), "text/csv")},
        data={"projectName": "NaN Param Test", "projectDescription": "Test fixture"},
    )
    assert res.status_code == 200
    return res.json()["project_id"]


def post_nan_payload(client, project_id, payload):
    """POST a body containing the raw NaN literal.

    httpx refuses to encode float('nan') via json=, so build the body manually
    with the standard-library encoder (allow_nan=True emits the literal NaN),
    which is exactly what real-world clients send.
    """
    body = json.dumps(payload, allow_nan=True).encode("utf-8")
    return client.post(
        f"/projects/{project_id}/transform",
        params={"preview": "true"},
        content=body,
        headers={"Content-Type": "application/json"},
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"operation_type": "handleOutliers",
         "outlier_params": {"column": "Total", "method": "iqr", "action": "clip",
                             "sensitivity": float("nan")}},
        {"operation_type": "handleOutliers",
         "outlier_params": {"column": "Total", "method": "iqr", "action": "clip",
                             "lower_percentile": float("nan")}},
        {"operation_type": "clipNumeric",
         "clip_numeric_params": {"column": "Total", "lower": float("nan")}},
    ],
)
def test_nan_params_return_422_not_500(client, numeric_project, payload):
    resp = post_nan_payload(client, numeric_project, payload)
    assert resp.status_code == 422
    # would raise if the payload still contained raw NaN floats
    data = resp.json()
    assert isinstance(data["detail"], list)


def test_valid_sensitivity_still_works(client, numeric_project):
    resp = client.post(
        f"/projects/{numeric_project}/transform",
        params={"preview": "true"},
        json={"operation_type": "handleOutliers",
              "outlier_params": {"column": "Total", "method": "iqr", "action": "clip",
                                  "sensitivity": 1.5}},
    )
    assert resp.status_code == 200
