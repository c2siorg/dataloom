"""Tests for the automated data quality engine."""

import pandas as pd
import pytest

from app.services.quality_engine import (
    DuplicateReport,
    FixAction,
    IssueType,
    OutlierReport,
    apply_fix,
    compute_quality_score,
    detect_duplicates,
    detect_outliers,
    profile_column,
    profile_dataframe,
    run_quality_assessment,
    suggest_fixes,
)


# -- fixtures ----------------------------------------------------------------


@pytest.fixture
def clean_df():
    """A small, clean DataFrame with no quality issues."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie", "Diana"],
            "age": [30, 25, 35, 28],
            "salary": [50000, 60000, 55000, 52000],
        }
    )


@pytest.fixture
def dirty_df():
    """A DataFrame with duplicates, nulls, and an outlier — for testing detection."""
    return pd.DataFrame(
        {
            "name": ["Alice", "Bob", "Charlie", "Alice", "Eve", None],
            "age": [30, 25, 35, 30, 28, None],
            "salary": [50000, 60000, 55000, 50000, 999999, 52000],
        }
    )


# -- profile_column ----------------------------------------------------------


class TestProfileColumn:
    def test_numeric_column(self, clean_df):
        profile = profile_column(clean_df["age"])
        assert profile.column_name == "age"
        assert profile.null_count == 0
        assert profile.null_percentage == 0.0
        assert profile.unique_count == 4
        assert profile.mean is not None
        assert profile.median is not None

    def test_string_column(self, clean_df):
        profile = profile_column(clean_df["name"])
        assert profile.column_name == "name"
        assert profile.null_count == 0
        # String columns should not have mean/std/median
        assert profile.mean is None
        assert profile.std is None

    def test_column_with_nulls(self, dirty_df):
        profile = profile_column(dirty_df["age"])
        assert profile.null_count == 1
        assert profile.null_percentage > 0

    def test_top_values(self, dirty_df):
        profile = profile_column(dirty_df["name"])
        # "Alice" appears twice, should be top value
        assert len(profile.top_values) > 0
        top_name = profile.top_values[0][0]
        assert top_name == "Alice"


# -- profile_dataframe -------------------------------------------------------


class TestProfileDataframe:
    def test_returns_one_per_column(self, clean_df):
        profiles = profile_dataframe(clean_df)
        assert len(profiles) == 3
        assert {p.column_name for p in profiles} == {"name", "age", "salary"}


# -- detect_duplicates -------------------------------------------------------


class TestDetectDuplicates:
    def test_finds_duplicates(self, dirty_df):
        report = detect_duplicates(dirty_df)
        # Row 3 (Alice, 30, 50000) is a duplicate of row 0
        assert report.total_duplicates >= 1
        assert report.duplicate_percentage > 0

    def test_clean_data_no_duplicates(self, clean_df):
        report = detect_duplicates(clean_df)
        assert report.total_duplicates == 0
        assert report.duplicate_percentage == 0.0

    def test_duplicate_indices(self, dirty_df):
        report = detect_duplicates(dirty_df)
        assert isinstance(report.duplicate_indices, list)
        assert all(isinstance(i, int) for i in report.duplicate_indices)


# -- detect_outliers ---------------------------------------------------------


class TestDetectOutliers:
    def test_iqr_finds_outlier(self, dirty_df):
        reports = detect_outliers(dirty_df, method="iqr")
        # 999999 in salary should be flagged
        salary_reports = [r for r in reports if r.column_name == "salary"]
        assert len(salary_reports) == 1
        assert salary_reports[0].outlier_count >= 1

    def test_zscore_finds_outlier(self, dirty_df):
        reports = detect_outliers(dirty_df, method="zscore", threshold=2.0)
        salary_reports = [r for r in reports if r.column_name == "salary"]
        assert len(salary_reports) == 1

    def test_clean_data_no_outliers(self, clean_df):
        reports = detect_outliers(clean_df, method="iqr")
        # Small uniform data should produce no outliers
        assert all(r.outlier_count == 0 for r in reports) or len(reports) == 0

    def test_outlier_bounds(self, dirty_df):
        reports = detect_outliers(dirty_df, method="iqr")
        for report in reports:
            assert report.lower_bound < report.upper_bound


# -- compute_quality_score ---------------------------------------------------


class TestComputeScore:
    def test_clean_data_high_score(self, clean_df):
        profiles = profile_dataframe(clean_df)
        dup_report = detect_duplicates(clean_df)
        outlier_reports = detect_outliers(clean_df)
        score = compute_quality_score(clean_df, profiles, dup_report, outlier_reports)
        assert score >= 90.0

    def test_dirty_data_lower_score(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        score = compute_quality_score(dirty_df, profiles, dup_report, outlier_reports)
        # Dirty data should score lower than clean data
        clean_score = 100.0  # approximate
        assert score < clean_score

    def test_empty_dataframe(self):
        empty = pd.DataFrame()
        score = compute_quality_score(empty, [], DuplicateReport(0, 0.0), [])
        assert score == 0.0

    def test_score_bounded(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        score = compute_quality_score(dirty_df, profiles, dup_report, outlier_reports)
        assert 0.0 <= score <= 100.0


# -- suggest_fixes -----------------------------------------------------------


class TestSuggestFixes:
    def test_suggests_duplicate_fix(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        fixes = suggest_fixes(profiles, dup_report, outlier_reports)
        dup_fixes = [f for f in fixes if f.issue_type == IssueType.DUPLICATE_ROWS]
        assert len(dup_fixes) >= 1

    def test_suggests_null_fix(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        fixes = suggest_fixes(profiles, dup_report, outlier_reports)
        null_fixes = [f for f in fixes if f.issue_type == IssueType.NULL_VALUES]
        assert len(null_fixes) >= 1

    def test_suggests_outlier_fix(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        fixes = suggest_fixes(profiles, dup_report, outlier_reports)
        outlier_fixes = [f for f in fixes if f.issue_type == IssueType.OUTLIER]
        assert len(outlier_fixes) >= 1

    def test_sorted_by_confidence(self, dirty_df):
        profiles = profile_dataframe(dirty_df)
        dup_report = detect_duplicates(dirty_df)
        outlier_reports = detect_outliers(dirty_df)
        fixes = suggest_fixes(profiles, dup_report, outlier_reports)
        confidences = [f.confidence for f in fixes]
        assert confidences == sorted(confidences, reverse=True)

    def test_clean_data_no_fixes(self, clean_df):
        profiles = profile_dataframe(clean_df)
        dup_report = detect_duplicates(clean_df)
        outlier_reports = detect_outliers(clean_df)
        fixes = suggest_fixes(profiles, dup_report, outlier_reports)
        # Clean data may still produce minor suggestions; duplicates should be zero
        dup_fixes = [f for f in fixes if f.issue_type == IssueType.DUPLICATE_ROWS]
        assert len(dup_fixes) == 0


# -- apply_fix ---------------------------------------------------------------


class TestApplyFix:
    def test_remove_duplicates(self, dirty_df):
        report = detect_duplicates(dirty_df)
        fixes = suggest_fixes(profile_dataframe(dirty_df), report, [])
        dup_fix = next(f for f in fixes if f.fix_action == FixAction.REMOVE_DUPLICATES)
        result = apply_fix(dirty_df, dup_fix)
        assert len(result) < len(dirty_df)
        # Verify no duplicates remain
        assert detect_duplicates(result).total_duplicates == 0

    def test_fill_null_median(self):
        df = pd.DataFrame({"val": [10.0, 20.0, None, 40.0]})
        from app.services.quality_engine import FixSuggestion

        fix = FixSuggestion(
            issue_type=IssueType.NULL_VALUES,
            fix_action=FixAction.FILL_NULL_MEDIAN,
            description="Fill nulls",
            confidence=0.85,
            affected_rows=1,
            affected_columns=["val"],
            parameters={"column": "val", "fill_value": 20.0},
        )
        result = apply_fix(df, fix)
        assert result["val"].isna().sum() == 0
        assert result["val"].iloc[2] == 20.0

    def test_remove_outliers(self, dirty_df):
        reports = detect_outliers(dirty_df, method="iqr")
        if not reports:
            pytest.skip("No outliers detected in test data")
        fixes = suggest_fixes([], DuplicateReport(0, 0.0), reports)
        outlier_fix = next(f for f in fixes if f.fix_action == FixAction.REMOVE_OUTLIERS)
        result = apply_fix(dirty_df, outlier_fix)
        assert len(result) < len(dirty_df)

    def test_fix_does_not_mutate_original(self, dirty_df):
        original_len = len(dirty_df)
        report = detect_duplicates(dirty_df)
        fixes = suggest_fixes(profile_dataframe(dirty_df), report, [])
        dup_fix = next(f for f in fixes if f.fix_action == FixAction.REMOVE_DUPLICATES)
        apply_fix(dirty_df, dup_fix)
        # Original should be unchanged
        assert len(dirty_df) == original_len


# -- apply_fix improves score ------------------------------------------------


class TestFixImprovesScore:
    def test_removing_duplicates_improves_score(self, dirty_df):
        report_before = run_quality_assessment(dirty_df)
        dup_fix = next(
            f for f in report_before.fix_suggestions if f.fix_action == FixAction.REMOVE_DUPLICATES
        )
        fixed_df = apply_fix(dirty_df, dup_fix)
        report_after = run_quality_assessment(fixed_df)
        assert report_after.score >= report_before.score


# -- run_quality_assessment (orchestrator) -----------------------------------


class TestRunQualityAssessment:
    def test_returns_complete_report(self, dirty_df):
        report = run_quality_assessment(dirty_df)
        assert 0.0 <= report.score <= 100.0
        assert report.row_count == len(dirty_df)
        assert report.column_count == len(dirty_df.columns)
        assert len(report.column_profiles) == 3
        assert isinstance(report.duplicate_report, DuplicateReport)
        assert isinstance(report.outlier_reports, list)
        assert isinstance(report.fix_suggestions, list)

    def test_clean_data_report(self, clean_df):
        report = run_quality_assessment(clean_df)
        assert report.score >= 90.0
        assert report.duplicate_report.total_duplicates == 0
