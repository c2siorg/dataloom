"""Chart builders must tolerate a column selected more than once.

Picking the same column for two chart roles is a legitimate request (a
column against itself, colouring by the x column), but the builders built
their working frame with the duplicated label, so the selection resolved to
a DataFrame instead of a Series:

- scatter with x == y returned 200 with every point null;
- line/area with x in y, or a repeated y, raised a pandas-internal
  ValueError (\"column label not unique\" / zip length mismatch);
- scatter with color == x or color == y raised \"Grouper not 1-dimensional\".

Deduplicating the frame columns (keeping series order and names) makes all
of these plot the chart that was asked for.
"""

import pandas as pd

from app.services import visualization_service as vs

DF = pd.DataFrame({"n": [1, 2, 3], "m": [10, 20, 30], "c": ["a", "b", "a"]})


def test_scatter_x_equals_y_plots_the_diagonal():
    spec = vs.build_scatter_plot(DF, "n", "n")

    assert spec["series"][0]["data"] == [
        {"x": 1.0, "y": 1.0},
        {"x": 2.0, "y": 2.0},
        {"x": 3.0, "y": 3.0},
    ]


def test_line_x_in_y_plots_that_series_against_itself():
    spec = vs.build_line_chart(DF, "n", ["n"])

    assert spec["series"] == [
        {
            "name": "n",
            "data": [{"x": 1.0, "y": 1.0}, {"x": 2.0, "y": 2.0}, {"x": 3.0, "y": 3.0}],
        }
    ]


def test_line_repeated_y_plots_once():
    spec = vs.build_line_chart(DF, "c", ["n", "n"])

    assert [series["name"] for series in spec["series"]] == ["n"]
    assert spec["series"][0]["data"] == [
        {"x": "a", "y": 1.0},
        {"x": "a", "y": 3.0},
        {"x": "b", "y": 2.0},
    ]


def test_area_x_in_y_plots_that_series_against_itself():
    spec = vs.build_area_chart(DF, "n", ["n"])

    assert spec["series"][0]["data"][0] == {"x": 1.0, "y": 1.0}


def test_scatter_colour_equal_to_x_groups_by_that_column():
    spec = vs.build_scatter_plot(DF, "n", "m", color_col="n")

    assert [series["name"] for series in spec["series"]] == ["1", "2", "3"]
    assert spec["series"][0]["data"] == [{"x": 1.0, "y": 10.0}]


def test_scatter_colour_equal_to_y_groups_by_that_column():
    spec = vs.build_scatter_plot(DF, "n", "m", color_col="m")

    assert [series["name"] for series in spec["series"]] == ["10", "20", "30"]


def test_scatter_and_line_endpoints_accept_duplicate_selections(client):
    # End-to-end through the chart endpoint, which maps builder ValueErrors
    # to 400: these selections must now return charts, not errors.
    project_id = None
    upload = client.post(
        "/projects/upload",
        files={"file": ("data.csv", b"n,m\n1,10\n2,20\n3,30\n", "text/csv")},
        data={"projectName": "Dup", "projectDescription": "duplicate chart columns"},
    )
    assert upload.status_code == 200, upload.text
    project_id = upload.json()["project_id"]

    scatter = client.get(
        f"/projects/{project_id}/charts",
        params={"chart_type": "scatter", "x": "n", "y": ["n"]},
    )
    assert scatter.status_code == 200, scatter.text
    assert scatter.json()["series"][0]["data"][0] == {"x": 1.0, "y": 1.0}

    line = client.get(
        f"/projects/{project_id}/charts",
        params={"chart_type": "line", "x": "n", "y": ["n"]},
    )
    assert line.status_code == 200, line.text
    assert line.json()["series"][0]["data"][0] == {"x": 1.0, "y": 1.0}
