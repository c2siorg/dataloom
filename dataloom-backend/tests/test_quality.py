"""Tests for the data quality service and endpoints."""

import pandas as pd
import pytest

from app.services import quality_service as qs

# --- Service: detectors ---


class TestDetectDuplicates:
    def test_flags_exact_duplicates(self):
        df = pd.DataFrame({"a": [1, 2, 1], "b": ["x", "y", "x"]})
        issues = qs.detect_duplicates(df)
        assert len(issues) == 1
        assert issues[0]["issue_type"] == "duplicate_rows"
        assert issues[0]["severity"] == "medium"
        assert issues[0]["count"] == 1
        assert issues[0]["sample_rows"] == [2]

    def test_clean_dataframe_has_no_issues(self):
        assert qs.detect_duplicates(pd.DataFrame({"a": [1, 2, 3]})) == []


class TestDetectMissingValues:
    def test_mostly_empty_column_is_high_severity(self):
        df = pd.DataFrame({"x": [1, None, None, None]})
        issues = qs.detect_missing_values(df)
        assert len(issues) == 1
        assert issues[0]["severity"] == "high"
        assert issues[0]["count"] == 3

    def test_some_nulls_are_low_severity(self):
        df = pd.DataFrame({"x": [1, 2, 3, None]})
        issues = qs.detect_missing_values(df)
        assert issues[0]["severity"] == "low"
        assert issues[0]["sample_rows"] == [3]

    def test_sentinel_strings_count_as_missing(self):
        df = pd.DataFrame({"x": ["a", "N/A", "null", "b"]})
        issues = qs.detect_missing_values(df)
        assert issues[0]["count"] == 2

    def test_empty_dataframe(self):
        assert qs.detect_missing_values(pd.DataFrame()) == []


class TestDetectOutliers:
    def test_iqr_flags_extreme_value(self):
        df = pd.DataFrame({"v": [12, 15, 14, 13, 90, 16, 11, 14]})
        issues = qs.detect_outliers(df)
        assert len(issues) == 1
        assert issues[0]["column"] == "v"
        assert issues[0]["count"] == 1
        assert issues[0]["sample_rows"] == [4]

    def test_zscore_method(self):
        values = [10.0] * 30 + [10.5] * 30 + [9.5] * 30 + [200.0]
        issues = qs.detect_outliers(pd.DataFrame({"v": values}), method="zscore")
        assert len(issues) == 1
        assert issues[0]["count"] == 1

    def test_higher_sensitivity_flags_less(self):
        df = pd.DataFrame({"v": [12, 15, 14, 13, 22, 16, 11, 14]})
        default = qs.detect_outliers(df, sensitivity=1.5)
        loose = qs.detect_outliers(df, sensitivity=10.0)
        assert len(default) == 1
        assert loose == []

    def test_constant_column_is_skipped(self):
        assert qs.detect_outliers(pd.DataFrame({"v": [5, 5, 5, 5, 5]})) == []

    def test_too_few_values_skipped(self):
        assert qs.detect_outliers(pd.DataFrame({"v": [1, 100]})) == []

    def test_unknown_method_raises(self):
        with pytest.raises(ValueError):
            qs.detect_outliers(pd.DataFrame({"v": [1, 2, 3, 4]}), method="magic")


class TestDetectTypeMismatches:
    def test_mostly_numeric_column_flags_offenders(self):
        df = pd.DataFrame({"v": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "oops"]})
        issues = qs.detect_type_mismatches(df)
        assert len(issues) == 1
        assert issues[0]["severity"] == "high"
        assert issues[0]["count"] == 1
        assert issues[0]["sample_rows"] == [9]

    def test_fully_numeric_text_column_is_castable(self):
        df = pd.DataFrame({"v": ["1", "2", "3"]})
        issues = qs.detect_type_mismatches(df)
        assert len(issues) == 1
        assert issues[0]["severity"] == "medium"
        assert "cast" in issues[0]["detail"]

    def test_mostly_dates_flags_offenders(self):
        values = [f"2024-01-{d:02d}" for d in range(1, 10)] + ["not a date"]
        issues = qs.detect_type_mismatches(pd.DataFrame({"v": values}))
        assert len(issues) == 1
        assert issues[0]["severity"] == "high"
        assert issues[0]["count"] == 1

    def test_fully_date_text_column_is_castable(self):
        df = pd.DataFrame({"v": ["2024-01-05", "2024-01-06", "2024-01-07"]})
        issues = qs.detect_type_mismatches(df)
        assert len(issues) == 1
        assert issues[0]["severity"] == "medium"
        assert "cast" in issues[0]["detail"]

    def test_genuinely_textual_column_not_flagged(self):
        df = pd.DataFrame({"v": ["alpha", "beta", "gamma", "delta"]})
        assert qs.detect_type_mismatches(df) == []


class TestValidatePatterns:
    def test_counts_non_matching_values(self):
        df = pd.DataFrame({"sku": ["AB-1234", "CD-5678", "bad", None]})
        issues = qs.validate_patterns(df, [{"column": "sku", "pattern": r"[A-Z]{2}-\d{4}"}])
        assert len(issues) == 1
        assert issues[0]["count"] == 1  # null is skipped, not a violation
        assert issues[0]["severity"] == "medium"

    def test_custom_severity(self):
        df = pd.DataFrame({"sku": ["bad"]})
        issues = qs.validate_patterns(df, [{"column": "sku", "pattern": r"\d+", "severity": "critical"}])
        assert issues[0]["severity"] == "critical"

    def test_all_matching_yields_no_issue(self):
        df = pd.DataFrame({"sku": ["12", "34"]})
        assert qs.validate_patterns(df, [{"column": "sku", "pattern": r"\d+"}]) == []

    def test_invalid_regex_raises(self):
        with pytest.raises(ValueError):
            qs.validate_patterns(pd.DataFrame({"a": ["x"]}), [{"column": "a", "pattern": "("}])

    def test_unknown_column_raises(self):
        with pytest.raises(ValueError):
            qs.validate_patterns(pd.DataFrame({"a": ["x"]}), [{"column": "nope", "pattern": "x"}])

    def test_catastrophic_pattern_hits_time_budget(self, monkeypatch):
        monkeypatch.setattr(qs, "PATTERN_TIME_BUDGET_SECONDS", 0.1)
        df = pd.DataFrame({"a": ["a" * 40]})
        with pytest.raises(ValueError, match="budget"):
            qs.validate_patterns(df, [{"column": "a", "pattern": r"(a|a)+b"}])


class TestDetectInconsistentFormats:
    def test_whitespace(self):
        df = pd.DataFrame({"city": ["NY ", "LA", " SF"]})
        issues = qs.detect_inconsistent_formats(df)
        ws = [i for i in issues if "whitespace" in i["detail"]]
        assert len(ws) == 1
        assert ws[0]["count"] == 2

    def test_mixed_casing(self):
        df = pd.DataFrame({"country": ["USA", "usa", "USA", "France"]})
        issues = qs.detect_inconsistent_formats(df)
        casing = [i for i in issues if "casing" in i["detail"]]
        assert len(casing) == 1
        assert casing[0]["count"] == 3  # all USA variants are affected

    def test_mixed_date_formats(self):
        df = pd.DataFrame({"d": ["2024-01-05", "2024-01-06", "05/01/2024", "2024-01-08"]})
        issues = qs.detect_inconsistent_formats(df)
        dates = [i for i in issues if "date format" in i["detail"]]
        assert len(dates) == 1

    def test_consistent_column_has_no_issues(self):
        df = pd.DataFrame({"city": ["NY", "LA", "SF"]})
        assert qs.detect_inconsistent_formats(df) == []


# --- Service: scoring, remediations, assess_quality ---


class TestScoring:
    def test_clean_dataframe_scores_100(self):
        df = pd.DataFrame({"a": [1, 2, 3, 4], "b": ["w", "x", "y", "z"]})
        report = qs.assess_quality(df)
        assert report["overall_score"] == 100.0
        assert report["issue_count"] == 0
        assert report["issues"] == []
        assert report["remediations"] == []
        assert report["column_scores"] == {"a": 100.0, "b": 100.0}

    def test_dirtier_data_scores_lower(self):
        clean = pd.DataFrame({"a": [1, 2, 3, 4]})
        dirty = pd.DataFrame({"a": [1, None, None, 1]})
        assert qs.assess_quality(dirty)["overall_score"] < qs.assess_quality(clean)["overall_score"]

    def test_score_is_bounded(self):
        df = pd.DataFrame({"a": [None, None], "b": [None, None]})
        score = qs.assess_quality(df)["overall_score"]
        assert 0.0 <= score <= 100.0

    def test_empty_dataframe_scores_100(self):
        assert qs.assess_quality(pd.DataFrame())["overall_score"] == 100.0

    def test_column_scores_isolate_the_bad_column(self):
        df = pd.DataFrame({"good": [1, 2, 3, 4], "bad": [1, None, None, None]})
        scores = qs.assess_quality(df)["column_scores"]
        assert scores["good"] == 100.0
        assert scores["bad"] < 100.0

    def test_issues_sorted_by_severity(self):
        df = pd.DataFrame(
            {
                "mostly_null": [1, None, None, None],  # high
                "some_null": [1, 2, 3, None],  # low
            }
        )
        issues = qs.assess_quality(df)["issues"]
        severities = [i["severity"] for i in issues]
        assert severities == sorted(severities, key=["critical", "high", "medium", "low"].index)


class TestRemediations:
    def test_duplicates_map_to_drop_duplicate_operation(self):
        df = pd.DataFrame({"a": [1, 1], "b": [2, 2]})
        report = qs.assess_quality(df)
        ops = {r["issue_type"]: r["operation"] for r in report["remediations"]}
        assert ops["duplicate_rows"] == "dropDuplicate"

    def test_each_issue_gets_a_remediation(self):
        df = pd.DataFrame({"a": [1, None, 3, 4], "b": ["x ", "Y", "y", "z"]})
        report = qs.assess_quality(df)
        assert len(report["remediations"]) == len(report["issues"])

    def test_outlier_remediation_has_no_operation(self):
        df = pd.DataFrame({"v": [12, 15, 14, 13, 90, 16, 11, 14]})
        report = qs.assess_quality(df)
        outlier = next(r for r in report["remediations"] if r["issue_type"] == "outliers")
        assert outlier["operation"] is None

    def test_mostly_empty_column_remediation_is_manual(self):
        df = pd.DataFrame({"x": [1, None, None, None]})
        report = qs.assess_quality(df)
        rem = next(r for r in report["remediations"] if r["issue_type"] == "missing_values")
        assert "dropping" in rem["suggestion"]
        assert rem["operation"] is None

    def test_casing_issue_on_column_named_whitespace(self):
        """Sub-case dispatch must not string-match column names in the detail."""
        df = pd.DataFrame({"whitespace_count": ["High", "high", "HIGH", "low"]})
        issues = qs.detect_inconsistent_formats(df)
        remediations = qs.suggest_remediations(issues)
        assert len(remediations) == 1
        assert remediations[0]["operation"] == "stringReplace"
        assert "casing" in remediations[0]["suggestion"]


def test_report_is_json_safe():
    """No NaN/inf anywhere in the payload — same invariant as profiling."""
    import json

    df = pd.DataFrame({"v": [1.0, None, float("inf"), 4.0], "s": ["a", "N/A", "b ", "B"]})
    report = qs.assess_quality(df)
    json.dumps(report, allow_nan=False)  # raises if NaN/inf leaked


# --- Endpoints ---


@pytest.fixture
def project(client, sample_csv):
    """Upload the sample CSV and return the created project payload."""
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Quality", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def project_id(project):
    return project["project_id"]


class TestQualityEndpoint:
    def test_run_assessment_returns_report(self, client, project_id):
        response = client.post(f"/projects/{project_id}/quality")
        assert response.status_code == 200, response.text
        body = response.json()
        assert 0 <= body["overall_score"] <= 100
        assert body["issue_count"] == len(body["issues"])
        assert len(body["remediations"]) == len(body["issues"])
        # sample_csv has a duplicate row, so at least that issue exists
        assert any(i["issue_type"] == "duplicate_rows" for i in body["issues"])

    def test_assessment_is_stateless_and_repeatable(self, client, project_id):
        first = client.post(f"/projects/{project_id}/quality").json()
        second = client.post(f"/projects/{project_id}/quality").json()
        assert first == second

    def test_pattern_rules_are_applied(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/quality",
            json={"pattern_rules": [{"column": "city", "pattern": r"[A-Z][a-z]+"}]},
        )
        assert response.status_code == 200
        violations = [i for i in response.json()["issues"] if i["issue_type"] == "pattern_violation"]
        # "New York" and "Los Angeles" contain spaces, so they fail the pattern
        assert len(violations) == 1
        assert violations[0]["column"] == "city"

    def test_invalid_regex_returns_422(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/quality",
            json={"pattern_rules": [{"column": "city", "pattern": "("}]},
        )
        assert response.status_code == 422

    def test_unknown_rule_column_returns_422(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/quality",
            json={"pattern_rules": [{"column": "nope", "pattern": "x"}]},
        )
        assert response.status_code == 422

    def test_zscore_method_accepted(self, client, project_id):
        response = client.post(
            f"/projects/{project_id}/quality",
            json={"outlier_method": "zscore", "outlier_sensitivity": 2.5},
        )
        assert response.status_code == 200

    def test_invalid_method_rejected_by_schema(self, client, project_id):
        response = client.post(f"/projects/{project_id}/quality", json={"outlier_method": "magic"})
        assert response.status_code == 422

    def test_requires_auth(self, anon_client, project_id):
        response = anon_client.post(f"/projects/{project_id}/quality")
        assert response.status_code == 401
