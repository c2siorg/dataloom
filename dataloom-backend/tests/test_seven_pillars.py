"""Unit tests for the seven-pillar expansion services.

Covers: multi-format file handling, merge/join, formula columns,
transformation pipelines, chart data, data quality, and multi-format export.
"""

import pandas as pd
import pytest

from app.services.chart_service import compute_chart_data, get_column_info
from app.services.export_service import export_dataframe, generate_quality_report_html
from app.services.file_service import _convert_to_csv, _to_csv_name
from app.services.formula_service import add_formula_column
from app.services.merge_service import concat_datasets, merge_datasets
from app.services.pipeline_service import replay_pipeline
from app.services.quality_service import (
    analyze_missing,
    apply_quality_fix,
    assess_quality,
    detect_duplicates,
    detect_outliers,
    detect_pattern_issues,
)
from app.services.transformation_service import TransformationError

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def sample_df():
    """Basic three-row DataFrame used across multiple test classes."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie"],
            "age": [25, 30, 35],
            "salary": [50000, 60000, 70000],
            "city": ["NYC", "LA", "Chicago"],
        }
    )


@pytest.fixture
def df_with_dupes():
    """DataFrame containing duplicate rows."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie", "Alice", "Bob"],
            "age": [25, 30, 35, 25, 30],
            "salary": [50000, 60000, 70000, 50000, 60000],
        }
    )


@pytest.fixture
def df_with_issues():
    """DataFrame with missing values, whitespace, and outlier problems."""
    return pd.DataFrame(
        {
            "name": ["  Alice ", "Bob", None, "Charlie", "Bob"],
            "value": [10, 20, 30, 1000, 20],
            "score": [1.0, None, 3.0, None, 5.0],
        }
    )


@pytest.fixture
def left_df():
    """Left DataFrame for merge tests."""
    return pd.DataFrame({"id": [1, 2, 3], "name": ["Alice", "Bob", "Charlie"]})


@pytest.fixture
def right_df():
    """Right DataFrame for merge tests."""
    return pd.DataFrame({"id": [2, 3, 4], "score": [85, 90, 95]})


@pytest.fixture
def chart_df():
    """DataFrame for chart tests with categorical and numeric columns."""
    return pd.DataFrame(
        {
            "category": ["A", "B", "A", "C", "B", "A"],
            "value": [10, 20, 15, 30, 25, 12],
            "score": [1.1, 2.2, 3.3, 4.4, 5.5, 6.6],
        }
    )


# ===========================================================================
# Pillar 1 — Multi-format file handling
# ===========================================================================


class TestToCsvName:
    def test_csv_file(self):
        assert _to_csv_name("/uploads/data.csv").endswith("data_copy.csv")

    def test_xlsx_file(self):
        assert _to_csv_name("/uploads/data.xlsx").endswith("data_copy.csv")

    def test_json_file(self):
        assert _to_csv_name("/uploads/data.json").endswith("data_copy.csv")

    def test_parquet_file(self):
        assert _to_csv_name("/uploads/data.parquet").endswith("data_copy.csv")

    def test_tsv_file(self):
        assert _to_csv_name("/uploads/data.tsv").endswith("data_copy.csv")


class TestConvertToCsv:
    def test_csv_to_csv(self, tmp_path):
        src = tmp_path / "test.csv"
        dest = tmp_path / "test_copy.csv"
        pd.DataFrame({"a": [1, 2]}).to_csv(src, index=False)
        _convert_to_csv(src, dest)
        assert len(pd.read_csv(dest)) == 2

    def test_tsv_to_csv(self, tmp_path):
        src = tmp_path / "test.tsv"
        dest = tmp_path / "test_copy.csv"
        pd.DataFrame({"a": [1, 2]}).to_csv(src, index=False, sep="\t")
        _convert_to_csv(src, dest)
        assert len(pd.read_csv(dest)) == 2

    def test_json_to_csv(self, tmp_path):
        src = tmp_path / "test.json"
        dest = tmp_path / "test_copy.csv"
        pd.DataFrame({"a": [1, 2]}).to_json(src)
        _convert_to_csv(src, dest)
        assert len(pd.read_csv(dest)) == 2

    def test_xlsx_to_csv(self, tmp_path):
        src = tmp_path / "test.xlsx"
        dest = tmp_path / "test_copy.csv"
        pd.DataFrame({"a": [1, 2]}).to_excel(src, index=False)
        _convert_to_csv(src, dest)
        assert len(pd.read_csv(dest)) == 2

    def test_parquet_to_csv(self, tmp_path):
        src = tmp_path / "test.parquet"
        dest = tmp_path / "test_copy.csv"
        pd.DataFrame({"a": [1, 2]}).to_parquet(src, index=False)
        _convert_to_csv(src, dest)
        assert len(pd.read_csv(dest)) == 2

    def test_unsupported_format_raises(self, tmp_path):
        src = tmp_path / "test.xml"
        src.write_text("<data/>")
        dest = tmp_path / "test_copy.csv"
        with pytest.raises(ValueError, match="Unsupported"):
            _convert_to_csv(src, dest)


# ===========================================================================
# Pillar 3 — Merge / join operations
# ===========================================================================


class TestMergeDatasets:
    def test_inner_join(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="inner", on="id")
        assert len(result) == 2

    def test_left_join(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="left", on="id")
        assert len(result) == 3

    def test_right_join(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="right", on="id")
        assert len(result) == 3

    def test_outer_join(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="outer", on="id")
        assert len(result) == 4

    def test_cross_join(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="cross")
        assert len(result) == 9

    def test_left_on_right_on(self, left_df, right_df):
        result = merge_datasets(left_df, right_df, how="inner", left_on="id", right_on="id")
        assert len(result) == 2

    def test_invalid_join_type(self, left_df, right_df):
        with pytest.raises(TransformationError):
            merge_datasets(left_df, right_df, how="invalid", on="id")


class TestConcatDatasets:
    def test_vertical_concat(self):
        df1 = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
        df2 = pd.DataFrame({"a": [5, 6], "b": [7, 8]})
        result = concat_datasets([df1, df2], axis=0)
        assert len(result) == 4

    def test_horizontal_concat(self):
        df1 = pd.DataFrame({"a": [1, 2]})
        df2 = pd.DataFrame({"b": [3, 4]})
        result = concat_datasets([df1, df2], axis=1)
        assert len(result.columns) == 2
        assert len(result) == 2

    def test_empty_list_raises(self):
        with pytest.raises(TransformationError):
            concat_datasets([], axis=0)


# ===========================================================================
# Pillar 4 — Formula columns
# ===========================================================================


class TestAddFormulaColumn:
    def test_simple_expression(self):
        df = pd.DataFrame({"quantity": [10, 20, 30], "price": [5.0, 3.0, 2.0]})
        result = add_formula_column(df, "total", "quantity * price")
        assert "total" in result.columns
        assert list(result["total"]) == [50.0, 60.0, 60.0]

    def test_arithmetic_expression(self):
        df = pd.DataFrame({"quantity": [10, 20, 30], "price": [5.0, 3.0, 2.0]})
        result = add_formula_column(df, "doubled", "quantity * 2")
        assert list(result["doubled"]) == [20, 40, 60]

    def test_invalid_expression_raises(self):
        df = pd.DataFrame({"a": [1, 2]})
        with pytest.raises(TransformationError):
            add_formula_column(df, "bad", "nonexistent_col + 1")

    def test_does_not_modify_original(self):
        df = pd.DataFrame({"quantity": [10, 20], "price": [5.0, 3.0]})
        original_cols = list(df.columns)
        add_formula_column(df, "new_col", "quantity + price")
        assert list(df.columns) == original_cols


# ===========================================================================
# Pillar 4 — Transformation pipelines
# ===========================================================================


class TestReplayPipeline:
    def test_single_filter_step(self, df_with_dupes):
        steps = [{"operation_type": "filter", "parameters": {"column": "age", "condition": ">", "value": "26"}}]
        result = replay_pipeline(df_with_dupes, steps)
        assert len(result) == 3  # ages 30, 35, 30

    def test_single_sort_step(self, df_with_dupes):
        steps = [{"operation_type": "sort", "sort_params": {"column": "age", "ascending": False}}]
        result = replay_pipeline(df_with_dupes, steps)
        assert result.iloc[0]["age"] == 35

    def test_multi_step_pipeline(self, df_with_dupes):
        steps = [
            {"operation_type": "sort", "sort_params": {"column": "age", "ascending": True}},
            {"operation_type": "dropDuplicate", "drop_duplicate": {"columns": "name,age", "keep": "first"}},
        ]
        result = replay_pipeline(df_with_dupes, steps)
        assert len(result) == 3

    def test_formula_step(self, df_with_dupes):
        steps = [{"operation_type": "formula", "formula": {"name": "double_age", "expression": "age * 2"}}]
        result = replay_pipeline(df_with_dupes, steps)
        assert "double_age" in result.columns

    def test_empty_pipeline(self, df_with_dupes):
        result = replay_pipeline(df_with_dupes, [])
        assert len(result) == len(df_with_dupes)

    def test_unknown_operation_raises(self, df_with_dupes):
        steps = [{"operation_type": "unknown_op"}]
        with pytest.raises(TransformationError):
            replay_pipeline(df_with_dupes, steps)

    def test_bad_step_raises_with_step_number(self, df_with_dupes):
        steps = [
            {"operation_type": "sort", "sort_params": {"column": "age", "ascending": True}},
            {"operation_type": "filter", "parameters": {"column": "nonexistent", "condition": "=", "value": "x"}},
        ]
        with pytest.raises(TransformationError, match="step 2"):
            replay_pipeline(df_with_dupes, steps)


# ===========================================================================
# Pillar 5 — Data visualization / chart service
# ===========================================================================


class TestGetColumnInfo:
    def test_returns_all_columns(self, chart_df):
        info = get_column_info(chart_df)
        names = [c["name"] for c in info]
        assert "category" in names
        assert "value" in names

    def test_correct_dtypes(self, chart_df):
        info = get_column_info(chart_df)
        by_name = {c["name"]: c["dtype"] for c in info}
        assert by_name["category"] == "categorical"
        assert by_name["value"] == "numeric"


class TestComputeChartData:
    def test_bar_chart(self, chart_df):
        result = compute_chart_data(chart_df, "bar", "category", "value")
        assert result["chart_type"] == "bar"
        assert len(result["data"]) > 0

    def test_line_chart(self, chart_df):
        result = compute_chart_data(chart_df, "line", "category", "value")
        assert result["chart_type"] == "line"

    def test_histogram(self, chart_df):
        result = compute_chart_data(chart_df, "histogram", "value")
        assert result["chart_type"] == "histogram"
        assert all("bin" in d and "count" in d for d in result["data"])

    def test_pie_chart(self, chart_df):
        result = compute_chart_data(chart_df, "pie", "category")
        assert result["chart_type"] == "pie"
        assert all("name" in d and "value" in d for d in result["data"])

    def test_scatter_chart(self, chart_df):
        result = compute_chart_data(chart_df, "scatter", "value", "score")
        assert result["chart_type"] == "scatter"

    def test_scatter_without_y_raises(self, chart_df):
        with pytest.raises(ValueError, match="requires both"):
            compute_chart_data(chart_df, "scatter", "value")

    def test_invalid_column_raises(self, chart_df):
        with pytest.raises(ValueError, match="not found"):
            compute_chart_data(chart_df, "bar", "nonexistent")

    def test_bar_count_only(self, chart_df):
        result = compute_chart_data(chart_df, "bar", "category")
        assert result["y_column"] == "count"

    def test_grouped_bar(self, chart_df):
        df = chart_df.copy()
        df["group"] = ["X", "Y", "X", "Y", "X", "Y"]
        result = compute_chart_data(df, "bar", "category", "value", group_by="group")
        assert "series" in result


# ===========================================================================
# Pillar 6 — Data quality engine
# ===========================================================================


class TestDetectDuplicates:
    def test_finds_exact_duplicates(self, df_with_dupes):
        result = detect_duplicates(df_with_dupes)
        assert result["exact_duplicate_count"] == 4
        assert result["duplicate_percentage"] > 0

    def test_no_duplicates(self, sample_df):
        result = detect_duplicates(sample_df)
        assert result["exact_duplicate_count"] == 0

    def test_empty_df(self):
        df = pd.DataFrame({"a": []})
        result = detect_duplicates(df)
        assert result["duplicate_percentage"] == 0


class TestDetectOutliers:
    def test_iqr_method(self, df_with_issues):
        result = detect_outliers(df_with_issues, method="iqr")
        assert result["method"] == "iqr"
        assert isinstance(result["columns"], dict)

    def test_zscore_method(self):
        df = pd.DataFrame({"val": [1, 2, 3, 4, 5, 100]})
        result = detect_outliers(df, method="zscore")
        assert result["method"] == "zscore"

    def test_no_numeric_columns(self):
        df = pd.DataFrame({"name": ["a", "b", "c"]})
        result = detect_outliers(df)
        assert result["total_outlier_count"] == 0


class TestAnalyzeMissing:
    def test_finds_missing(self, df_with_issues):
        result = analyze_missing(df_with_issues)
        assert result["total_missing"] > 0
        assert "score" in result["columns"]

    def test_no_missing(self, sample_df):
        result = analyze_missing(sample_df)
        assert result["total_missing"] == 0


class TestDetectPatternIssues:
    def test_whitespace_detection(self, df_with_issues):
        result = detect_pattern_issues(df_with_issues)
        issues = [i for i in result["issues"] if i["issue"] == "leading_trailing_whitespace"]
        assert len(issues) > 0

    def test_no_issues(self):
        df = pd.DataFrame({"a": [1, 2, 3]})
        result = detect_pattern_issues(df)
        assert result["issue_count"] == 0


class TestAssessQuality:
    def test_returns_overall_score(self, df_with_dupes):
        result = assess_quality(df_with_dupes)
        assert 0 <= result["overall_score"] <= 100

    def test_returns_all_sections(self, df_with_dupes):
        result = assess_quality(df_with_dupes)
        assert "duplicates" in result
        assert "outliers" in result
        assert "missing" in result
        assert "pattern_issues" in result
        assert "suggestions" in result

    def test_generates_suggestions_for_issues(self, df_with_issues):
        result = assess_quality(df_with_issues)
        assert isinstance(result["suggestions"], list)


class TestApplyQualityFix:
    def test_drop_duplicates(self, df_with_dupes):
        result = apply_quality_fix(df_with_dupes, "drop_duplicates", {})
        assert len(result) < len(df_with_dupes)

    def test_fill_missing_mean(self, df_with_issues):
        result = apply_quality_fix(df_with_issues, "fill_missing", {"column": "score", "strategy": "mean"})
        assert result["score"].isnull().sum() == 0

    def test_fill_missing_median(self, df_with_issues):
        result = apply_quality_fix(df_with_issues, "fill_missing", {"column": "score", "strategy": "median"})
        assert result["score"].isnull().sum() == 0

    def test_fill_missing_mode(self, df_with_issues):
        result = apply_quality_fix(df_with_issues, "fill_missing", {"column": "name", "strategy": "mode"})
        assert result["name"].isnull().sum() == 0

    def test_trim_whitespace(self, df_with_issues):
        result = apply_quality_fix(df_with_issues, "trim_whitespace", {})
        for val in result["name"].dropna():
            assert val == val.strip()

    def test_remove_outliers(self):
        df = pd.DataFrame({"val": [1, 2, 3, 4, 5, 1000]})
        result = apply_quality_fix(df, "remove_outliers", {"column": "val"})
        assert len(result) < len(df)

    def test_unknown_fix_returns_unchanged(self, sample_df):
        result = apply_quality_fix(sample_df, "unknown_fix", {})
        assert len(result) == len(sample_df)


# ===========================================================================
# Pillar 7 — Multi-format export + quality reports
# ===========================================================================


class TestExportDataframe:
    def test_csv_export(self, sample_df):
        buf, filename, media_type = export_dataframe(sample_df, "csv")
        assert filename == "export.csv"
        assert media_type == "text/csv"
        assert "Alice" in buf.getvalue().decode("utf-8")

    def test_tsv_export(self, sample_df):
        buf, filename, media_type = export_dataframe(sample_df, "tsv")
        assert filename == "export.tsv"
        assert "\t" in buf.getvalue().decode("utf-8")

    def test_json_export(self, sample_df):
        buf, filename, media_type = export_dataframe(sample_df, "json")
        assert filename == "export.json"
        assert media_type == "application/json"

    def test_xlsx_export(self, sample_df):
        buf, filename, media_type = export_dataframe(sample_df, "xlsx")
        assert filename == "export.xlsx"
        assert "spreadsheetml" in media_type

    def test_parquet_export(self, sample_df):
        buf, filename, media_type = export_dataframe(sample_df, "parquet")
        assert filename == "export.parquet"
        buf.seek(0)
        df_back = pd.read_parquet(buf)
        assert len(df_back) == 3

    def test_unsupported_format_raises(self, sample_df):
        with pytest.raises(ValueError, match="Unsupported"):
            export_dataframe(sample_df, "xml")


class TestGenerateQualityReport:
    def test_returns_html_string(self, sample_df):
        html = generate_quality_report_html(sample_df, "TestProject")
        assert "<!DOCTYPE html>" in html
        assert "TestProject" in html

    def test_contains_quality_score(self, sample_df):
        html = generate_quality_report_html(sample_df)
        assert "Quality Score" in html

    def test_contains_column_profiles(self, sample_df):
        html = generate_quality_report_html(sample_df)
        assert "name" in html
        assert "age" in html
