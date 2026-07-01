"""Tests for the visualization service and endpoints."""

import numpy as np
import pandas as pd
import pytest

from app.services import visualization_service as vs

# --- Service: build_histogram ---


class TestBuildHistogram:
    def test_bins_count_to_total_rows(self):
        spec = vs.build_histogram(pd.DataFrame({"v": list(range(100))}), "v", bins=10)
        assert spec["chart_type"] == "histogram"
        data = spec["series"][0]["data"]
        assert len(data) == 10
        assert sum(point["y"] for point in data) == 100
        assert spec["meta"]["bins"] == 10
        assert spec["meta"]["total_rows"] == 100

    def test_constant_column_collapses_to_one_bin(self):
        spec = vs.build_histogram(pd.DataFrame({"v": [5, 5, 5]}), "v")
        data = spec["series"][0]["data"]
        assert len(data) == 1
        assert data[0]["y"] == 3
        assert spec["meta"]["bins"] == 1

    def test_all_null_column_yields_empty_series(self):
        spec = vs.build_histogram(pd.DataFrame({"v": [None, None]}, dtype="float"), "v")
        assert spec["series"][0]["data"] == []

    def test_bins_are_clamped(self):
        spec = vs.build_histogram(pd.DataFrame({"v": list(range(50))}), "v", bins=99999)
        assert spec["meta"]["bins"] == vs.MAX_BINS

    def test_non_numeric_column_raises(self):
        with pytest.raises(ValueError, match="not numeric"):
            vs.build_histogram(pd.DataFrame({"c": ["a", "b"]}), "c")


# --- Service: build_bar_chart ---


class TestBuildBarChart:
    def test_sum_aggregation(self):
        df = pd.DataFrame({"region": ["a", "b", "a"], "sales": [10, 5, 20]})
        spec = vs.build_bar_chart(df, "region", "sales", agg="sum")
        data = {point["x"]: point["y"] for point in spec["series"][0]["data"]}
        assert data == {"a": 30.0, "b": 5.0}
        # Sorted by value descending.
        assert spec["series"][0]["data"][0]["x"] == "a"

    def test_count_aggregation_ignores_value_col(self):
        df = pd.DataFrame({"region": ["a", "b", "a"]})
        spec = vs.build_bar_chart(df, "region", agg="count")
        data = {point["x"]: point["y"] for point in spec["series"][0]["data"]}
        assert data == {"a": 2.0, "b": 1.0}

    def test_mean_aggregation(self):
        df = pd.DataFrame({"region": ["a", "a", "b"], "sales": [10, 20, 7]})
        spec = vs.build_bar_chart(df, "region", "sales", agg="mean")
        data = {point["x"]: point["y"] for point in spec["series"][0]["data"]}
        assert data == {"a": 15.0, "b": 7.0}

    def test_high_cardinality_is_capped_and_flagged(self):
        n = vs.MAX_BAR_CATEGORIES + 5
        df = pd.DataFrame({"k": [f"c{i}" for i in range(n)], "v": [1] * n})
        spec = vs.build_bar_chart(df, "k", "v", agg="sum")
        assert len(spec["series"][0]["data"]) == vs.MAX_BAR_CATEGORIES
        assert spec["meta"]["truncated"] is True

    def test_non_count_without_value_raises(self):
        with pytest.raises(ValueError, match="value_col is required"):
            vs.build_bar_chart(pd.DataFrame({"k": ["a"]}), "k", agg="sum")

    def test_unknown_aggregation_raises(self):
        with pytest.raises(ValueError, match="Unsupported aggregation"):
            vs.build_bar_chart(pd.DataFrame({"k": ["a"], "v": [1]}), "k", "v", agg="bogus")


# --- Service: build_line_chart / build_area_chart ---


class TestBuildLineChart:
    def test_sorts_by_x_and_emits_iso_dates(self):
        df = pd.DataFrame(
            {
                "day": pd.to_datetime(["2020-03-01", "2020-01-01", "2020-02-01"]),
                "v": [3, 1, 2],
            }
        )
        spec = vs.build_line_chart(df, "day", ["v"])
        xs = [point["x"] for point in spec["series"][0]["data"]]
        assert xs == sorted(xs)
        assert xs[0].startswith("2020-01-01")

    def test_multiple_y_columns_become_multiple_series(self):
        df = pd.DataFrame({"x": [1, 2, 3], "a": [1, 2, 3], "b": [3, 2, 1]})
        spec = vs.build_line_chart(df, "x", ["a", "b"])
        assert [s["name"] for s in spec["series"]] == ["a", "b"]

    def test_downsamples_large_input(self):
        df = pd.DataFrame({"x": range(10000), "y": range(10000)})
        spec = vs.build_line_chart(df, "x", ["y"])
        assert len(spec["series"][0]["data"]) <= vs.MAX_LINE_POINTS
        assert spec["meta"]["sampled"] is True

    def test_area_chart_type(self):
        spec = vs.build_area_chart(pd.DataFrame({"x": [1, 2], "y": [1, 2]}), "x", ["y"])
        assert spec["chart_type"] == "area"

    def test_no_y_columns_raises(self):
        with pytest.raises(ValueError, match="at least one y"):
            vs.build_line_chart(pd.DataFrame({"x": [1]}), "x", [])


# --- Service: build_scatter_plot ---


class TestBuildScatter:
    def test_drops_rows_missing_x_or_y(self):
        df = pd.DataFrame({"x": [1, None, 3], "y": [1, 2, None]})
        spec = vs.build_scatter_plot(df, "x", "y")
        assert len(spec["series"][0]["data"]) == 1

    def test_color_col_splits_into_series(self):
        df = pd.DataFrame({"x": [1, 2, 3], "y": [1, 2, 3], "g": ["a", "b", "a"]})
        spec = vs.build_scatter_plot(df, "x", "y", color_col="g")
        assert {s["name"] for s in spec["series"]} == {"a", "b"}

    def test_samples_when_over_max_points(self):
        df = pd.DataFrame({"x": range(5000), "y": range(5000)})
        spec = vs.build_scatter_plot(df, "x", "y", max_points=1000)
        assert len(spec["series"][0]["data"]) == 1000
        assert spec["meta"]["sampled"] is True

    def test_non_numeric_axis_raises(self):
        with pytest.raises(ValueError, match="not numeric"):
            vs.build_scatter_plot(pd.DataFrame({"x": ["a"], "y": [1]}), "x", "y")


# --- Service: build_pie_chart ---


class TestBuildPie:
    def test_counts_by_default(self):
        spec = vs.build_pie_chart(pd.DataFrame({"k": ["a", "a", "b"]}), "k")
        data = {point["x"]: point["y"] for point in spec["series"][0]["data"]}
        assert data == {"a": 2.0, "b": 1.0}

    def test_sums_a_value_column(self):
        df = pd.DataFrame({"k": ["a", "a", "b"], "v": [1, 2, 5]})
        spec = vs.build_pie_chart(df, "k", "v")
        data = {point["x"]: point["y"] for point in spec["series"][0]["data"]}
        assert data == {"a": 3.0, "b": 5.0}

    def test_collapses_overflow_into_other(self):
        n = vs.MAX_PIE_SLICES + 4
        df = pd.DataFrame({"k": [f"c{i}" for i in range(n)]})
        spec = vs.build_pie_chart(df, "k")
        labels = [point["x"] for point in spec["series"][0]["data"]]
        assert labels[-1] == "Other"
        assert len(labels) == vs.MAX_PIE_SLICES + 1
        assert spec["meta"]["truncated"] is True


# --- Service: suggest_charts ---


class TestSuggestCharts:
    def test_recommends_relevant_charts(self):
        df = pd.DataFrame(
            {
                "day": pd.to_datetime(pd.date_range("2020-01-01", periods=6)),
                "revenue": [1, 2, 3, 4, 5, 6],
                "cost": [2, 4, 6, 8, 10, 12],
                "region": ["a", "b", "a", "b", "a", "b"],
            }
        )
        types = [spec["chart_type"] for spec in vs.suggest_charts(df)]
        assert len(types) <= 3
        # Two correlated numerics → scatter is the top suggestion.
        assert types[0] == "scatter"

    def test_empty_dataframe_suggests_nothing(self):
        assert vs.suggest_charts(pd.DataFrame()) == []

    def test_single_numeric_suggests_histogram(self):
        types = [spec["chart_type"] for spec in vs.suggest_charts(pd.DataFrame({"v": [1, 2, 3, 4]}))]
        assert "histogram" in types


# --- JSON safety ---


def test_charts_emit_no_nan_or_inf():
    """Every numeric y must be JSON-safe (None, not NaN/inf)."""
    df = pd.DataFrame({"k": ["a", "b"], "v": [np.inf, np.nan]})
    spec = vs.build_bar_chart(df, "k", "v", agg="sum")
    for point in spec["series"][0]["data"]:
        if isinstance(point["y"], float):
            assert np.isfinite(point["y"])


# --- Endpoints ---


@pytest.fixture
def project_id(client, tmp_path):
    """Upload a CSV with a datetime, numerics, and a low-card category."""
    csv = tmp_path / "viz.csv"
    csv.write_text(
        "day,revenue,cost,region\n"
        "2020-01-01,10,5,north\n"
        "2020-01-02,20,8,south\n"
        "2020-01-03,30,12,north\n"
        "2020-01-04,40,15,south\n"
    )
    with open(csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("viz.csv", f, "text/csv")},
            data={"projectName": "Viz", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


class TestVisualizationEndpoints:
    def test_suggest(self, client, project_id):
        response = client.get(f"/projects/{project_id}/charts/suggest")
        assert response.status_code == 200, response.text
        suggestions = response.json()["suggestions"]
        assert len(suggestions) >= 1
        assert all("chart_type" in s for s in suggestions)

    def test_histogram(self, client, project_id):
        response = client.get(
            f"/projects/{project_id}/charts",
            params={"chart_type": "histogram", "column": "revenue", "bins": 4},
        )
        assert response.status_code == 200, response.text
        assert response.json()["chart_type"] == "histogram"

    def test_bar(self, client, project_id):
        response = client.get(
            f"/projects/{project_id}/charts",
            params={"chart_type": "bar", "category": "region", "value": "revenue", "agg": "sum"},
        )
        assert response.status_code == 200, response.text
        data = {p["x"]: p["y"] for p in response.json()["series"][0]["data"]}
        assert data == {"north": 40.0, "south": 60.0}

    def test_scatter(self, client, project_id):
        response = client.get(
            f"/projects/{project_id}/charts",
            params={"chart_type": "scatter", "x": "revenue", "y": "cost"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["chart_type"] == "scatter"

    def test_missing_required_param_returns_400(self, client, project_id):
        response = client.get(f"/projects/{project_id}/charts", params={"chart_type": "histogram"})
        assert response.status_code == 400
        assert "requires" in response.json()["detail"].lower()

    def test_non_numeric_histogram_returns_400(self, client, project_id):
        response = client.get(
            f"/projects/{project_id}/charts",
            params={"chart_type": "histogram", "column": "region"},
        )
        assert response.status_code == 400

    def test_unknown_column_returns_404(self, client, project_id):
        response = client.get(
            f"/projects/{project_id}/charts",
            params={"chart_type": "histogram", "column": "nope"},
        )
        assert response.status_code == 404

    def test_requires_auth(self, anon_client, project_id):
        response = anon_client.get(f"/projects/{project_id}/charts/suggest")
        assert response.status_code == 401
