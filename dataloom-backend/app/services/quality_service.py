"""Data quality service: issue detection, scoring, and remediation suggestions.

Pure functions, no side effects — each takes a DataFrame and returns plain data;
the endpoint layer handles I/O and persistence. This mirrors
``profiling_service``'s style and builds on its primitives (sentinel coercion),
so the two features always agree on what counts as "missing". The dependency is
one-way: quality imports profiling, never the reverse.

Where profiling is descriptive ("what does this dataset look like?"), quality is
evaluative: every finding is an *issue* with a severity, the issues aggregate
into a 0–100 score, and each issue type maps to a suggested fix — usually one of
the existing transformation operations.

Conventions:
- Issues are plain dicts: ``issue_type``, ``severity``, ``column`` (None for
  dataset-wide issues), ``count`` (affected rows/values), ``detail``,
  ``sample_rows`` (0-based positional indices, capped, for table highlighting),
  and ``subtype`` (an internal discriminator for issue types with several
  sub-checks; not part of the API response schema).
- All numeric output is JSON-safe; percentages are 0–100.
"""

import re
import time
from typing import Any

import pandas as pd
import regex

from app.services.profiling_service import _coerce_sentinels

# Severity → penalty weight used by the score. Judgment values, tunable.
SEVERITY_WEIGHTS = {"critical": 10, "high": 5, "medium": 2, "low": 1}

# Null share above which a column counts as "mostly empty" (HIGH severity).
MOSTLY_EMPTY_THRESHOLD = 50.0
# Default outlier sensitivities: Tukey's 1.5×IQR fence / |z| > 3.
DEFAULT_IQR_SENSITIVITY = 1.5
DEFAULT_ZSCORE_SENSITIVITY = 3.0
# Minimum non-null values for outlier detection to be meaningful.
MIN_OUTLIER_SAMPLE = 4
# Share of values that must parse as numeric/datetime for a text column to be
# treated as "meant to be" that type (the failures are then mismatches).
TYPE_PARSE_THRESHOLD = 0.8
# Cap on positional row indices attached to an issue.
SAMPLE_ROWS_LIMIT = 20
# Total wall-clock budget for evaluating all pattern rules in one assessment.
# Patterns are user-supplied regexes; a catastrophic-backtracking pattern must
# fail the request, not hang the worker.
PATTERN_TIME_BUDGET_SECONDS = 5.0
# Calibration factor turning the weighted penalty ratio into score points:
# e.g. 10% of cells affected at MEDIUM (weight 2) costs 20 points.
SCORE_PENALTY_FACTOR = 100.0


def _sample_rows(mask: pd.Series) -> list[int]:
    """Return up to SAMPLE_ROWS_LIMIT 0-based positions where ``mask`` is True."""
    positions = mask.reset_index(drop=True)
    return [int(i) for i in positions[positions].index[:SAMPLE_ROWS_LIMIT]]


def _issue(
    issue_type: str,
    severity: str,
    column: str | None,
    count: int,
    detail: str,
    sample_rows: list[int] | None = None,
    subtype: str | None = None,
) -> dict[str, Any]:
    return {
        "issue_type": issue_type,
        "severity": severity,
        "column": column,
        "count": count,
        "detail": detail,
        "sample_rows": sample_rows or [],
        "subtype": subtype,
    }


def detect_duplicates(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Flag exact duplicate rows (all-but-first, matching pandas semantics)."""
    mask = df.duplicated()
    count = int(mask.sum())
    if count == 0:
        return []
    return [
        _issue(
            "duplicate_rows",
            "medium",
            None,
            count,
            f"{count} row(s) are exact duplicates of an earlier row",
            _sample_rows(mask),
        )
    ]


def detect_missing_values(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Flag per-column missing values, after sentinel coercion.

    A column above MOSTLY_EMPTY_THRESHOLD percent null is HIGH severity (filling
    it would fabricate more data than exists); any other column with nulls is
    LOW.
    """
    issues = []
    row_count = len(df)
    if row_count == 0:
        return issues
    for column in df.columns:
        series = _coerce_sentinels(df[column])
        mask = series.isna()
        null_count = int(mask.sum())
        if null_count == 0:
            continue
        percentage = null_count / row_count * 100
        if percentage > MOSTLY_EMPTY_THRESHOLD:
            issues.append(
                _issue(
                    "missing_values",
                    "high",
                    str(column),
                    null_count,
                    f"Column '{column}' is {percentage:.1f}% empty",
                    _sample_rows(mask),
                )
            )
        else:
            issues.append(
                _issue(
                    "missing_values",
                    "low",
                    str(column),
                    null_count,
                    f"Column '{column}' has {null_count} missing value(s) ({percentage:.1f}%)",
                    _sample_rows(mask),
                )
            )
    return issues


def detect_outliers(
    df: pd.DataFrame,
    method: str = "iqr",
    sensitivity: float | None = None,
) -> list[dict[str, Any]]:
    """Flag statistical outliers per numeric column.

    ``iqr`` (default) flags values beyond ``sensitivity`` × IQR outside the
    quartiles — robust, no distribution assumption. ``zscore`` flags values more
    than ``sensitivity`` standard deviations from the mean — assumes roughly
    bell-shaped data. Columns with fewer than MIN_OUTLIER_SAMPLE non-null values
    or no spread (IQR/std of 0) are skipped rather than flagged wholesale.

    Raises:
        ValueError: If ``method`` is not "iqr" or "zscore".
    """
    if method not in ("iqr", "zscore"):
        raise ValueError(f"Unknown outlier method: {method!r}")
    if sensitivity is None:
        sensitivity = DEFAULT_IQR_SENSITIVITY if method == "iqr" else DEFAULT_ZSCORE_SENSITIVITY

    issues = []
    for column in df.select_dtypes(include=["number"]).columns:
        series = df[column]
        non_null = series.dropna()
        if len(non_null) < MIN_OUTLIER_SAMPLE:
            continue
        if method == "iqr":
            q1, q3 = non_null.quantile(0.25), non_null.quantile(0.75)
            iqr = q3 - q1
            if iqr == 0:
                continue
            mask = (series < q1 - sensitivity * iqr) | (series > q3 + sensitivity * iqr)
        else:
            mean, std = non_null.mean(), non_null.std()
            if not std or pd.isna(std):
                continue
            mask = ((series - mean) / std).abs() > sensitivity
        mask = mask.fillna(False)
        count = int(mask.sum())
        if count == 0:
            continue
        issues.append(
            _issue(
                "outliers",
                "medium",
                str(column),
                count,
                f"Column '{column}' has {count} outlier value(s) ({method}, sensitivity {sensitivity:g})",
                _sample_rows(mask),
            )
        )
    return issues


def detect_type_mismatches(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Flag text columns that are "meant to be" numeric or datetime.

    A text column where at least TYPE_PARSE_THRESHOLD of the non-null values
    parse as numeric is treated as a numeric column poisoned by the failures
    (HIGH — one bad cell forces the whole column to text). A fully-parseable
    column is still reported (MEDIUM) as castable. Datetime gets the same
    mostly-parseable check, restricted to values that do *not* parse as numeric
    (dateutil happily parses "30" as a date, which would be a false positive).
    """
    issues = []
    for column in df.select_dtypes(include=["object"]).columns:
        series = _coerce_sentinels(df[column])
        non_null = series.dropna()
        total = len(non_null)
        if total == 0:
            continue

        numeric = pd.to_numeric(non_null, errors="coerce")
        numeric_rate = numeric.notna().sum() / total
        if numeric_rate == 1.0:
            issues.append(
                _issue(
                    "type_mismatch",
                    "medium",
                    str(column),
                    total,
                    f"Column '{column}' contains only numbers but is stored as text — cast it to numeric",
                )
            )
            continue
        if numeric_rate >= TYPE_PARSE_THRESHOLD:
            mask = series.notna() & pd.to_numeric(series, errors="coerce").isna()
            count = int(mask.sum())
            issues.append(
                _issue(
                    "type_mismatch",
                    "high",
                    str(column),
                    count,
                    f"Column '{column}' is mostly numeric but {count} value(s) are not",
                    _sample_rows(mask),
                )
            )
            continue

        if numeric_rate == 0:
            dates = pd.to_datetime(non_null, errors="coerce", format="mixed")
            date_rate = dates.notna().sum() / total
            if date_rate == 1.0:
                issues.append(
                    _issue(
                        "type_mismatch",
                        "medium",
                        str(column),
                        total,
                        f"Column '{column}' contains only dates but is stored as text — cast it to datetime",
                    )
                )
                continue
            if date_rate >= TYPE_PARSE_THRESHOLD:
                parsed = pd.to_datetime(series, errors="coerce", format="mixed")
                mask = series.notna() & parsed.isna()
                count = int(mask.sum())
                issues.append(
                    _issue(
                        "type_mismatch",
                        "high",
                        str(column),
                        count,
                        f"Column '{column}' is mostly dates but {count} value(s) are not",
                        _sample_rows(mask),
                    )
                )
    return issues


def validate_patterns(df: pd.DataFrame, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag values failing user-defined regex rules.

    Each rule is ``{"column", "pattern", "severity"}``; a value passes when the
    whole value matches (fullmatch) after string conversion. Nulls are skipped —
    missing-ness is detect_missing_values' job. Matching uses the ``regex``
    module for its per-call timeout: all rules share
    PATTERN_TIME_BUDGET_SECONDS, so a catastrophic-backtracking pattern raises
    instead of hanging.

    Raises:
        ValueError: If a pattern is not a valid regex, names an unknown column,
            or exceeds the evaluation time budget.
    """
    issues = []
    deadline = time.monotonic() + PATTERN_TIME_BUDGET_SECONDS
    for rule in rules:
        column = rule["column"]
        if column not in df.columns:
            raise ValueError(f"Unknown column in pattern rule: {column!r}")
        try:
            compiled = regex.compile(rule["pattern"])
        except regex.error as e:
            raise ValueError(f"Invalid regex for column {column!r}: {e}") from e
        severity = rule.get("severity", "medium")

        def _fails(value: Any, _compiled: regex.Pattern = compiled) -> bool:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            return _compiled.fullmatch(str(value), timeout=remaining) is None

        series = _coerce_sentinels(df[column])
        try:
            mask = series.notna() & series.map(_fails)
        except TimeoutError:
            raise ValueError(
                f"Pattern rules exceeded the {PATTERN_TIME_BUDGET_SECONDS:g}s evaluation budget "
                f"on column {column!r} — simplify the pattern"
            ) from None
        count = int(mask.sum())
        if count == 0:
            continue
        issues.append(
            _issue(
                "pattern_violation",
                severity,
                str(column),
                count,
                f"Column '{column}' has {count} value(s) not matching pattern {rule['pattern']!r}",
                _sample_rows(mask),
            )
        )
    return issues


def detect_inconsistent_formats(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Flag formatting drift inside text columns.

    Three checks per text column: values with leading/trailing whitespace (LOW),
    values that differ only by casing/surrounding whitespace from another value
    in the column (LOW), and mixed date formats among mostly-date values
    (MEDIUM). Each is cheap to fix but silently splits groups, bars, and joins.
    """
    issues = []
    for column in df.select_dtypes(include=["object"]).columns:
        series = _coerce_sentinels(df[column])
        strings = series.dropna().map(str)
        if strings.empty:
            continue

        ws_mask = (strings != strings.str.strip()).reindex(series.index, fill_value=False)
        ws_count = int(ws_mask.sum())
        if ws_count:
            issues.append(
                _issue(
                    "inconsistent_format",
                    "low",
                    str(column),
                    ws_count,
                    f"Column '{column}' has {ws_count} value(s) with leading/trailing whitespace",
                    _sample_rows(ws_mask),
                    subtype="whitespace",
                )
            )

        canonical = strings.str.strip().str.lower()
        variants_per_group = strings.str.strip().groupby(canonical).nunique()
        mixed_groups = variants_per_group[variants_per_group > 1]
        if not mixed_groups.empty:
            affected = int(canonical.isin(mixed_groups.index).sum())
            examples = ", ".join(repr(g) for g in list(mixed_groups.index[:3]))
            issues.append(
                _issue(
                    "inconsistent_format",
                    "low",
                    str(column),
                    affected,
                    f"Column '{column}' has {affected} value(s) differing only by casing (e.g. {examples})",
                    subtype="casing",
                )
            )

        numeric_rate = pd.to_numeric(strings, errors="coerce").notna().sum() / len(strings)
        if numeric_rate == 0:
            dates = pd.to_datetime(strings, errors="coerce", format="mixed")
            if dates.notna().sum() / len(strings) >= TYPE_PARSE_THRESHOLD:
                shapes = strings[dates.notna()].map(lambda v: re.sub(r"\d+", "#", v.strip()))
                if shapes.nunique() > 1:
                    issues.append(
                        _issue(
                            "inconsistent_format",
                            "medium",
                            str(column),
                            int(dates.notna().sum()),
                            f"Column '{column}' mixes {shapes.nunique()} different date formats",
                            subtype="date_format",
                        )
                    )
    return issues


def suggest_remediations(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map detected issues to suggested fixes.

    Where the fix is an existing transformation, ``operation`` names its
    OperationType so the frontend can wire the suggestion to the transform flow;
    it is None where a human has to judge (outliers) or edit values.
    """
    remediations = []
    for issue in issues:
        column = issue["column"]
        issue_type = issue["issue_type"]
        count = issue["count"]
        if issue_type == "duplicate_rows":
            suggestion, operation = f"Drop {count} duplicate row(s)", "dropDuplicate"
        elif issue_type == "missing_values" and issue["severity"] == "high":
            # Dropping a whole column is destructive and has no docked form —
            # leave it to the user (right-click the column header).
            suggestion, operation = f"Column '{column}' is mostly empty, consider dropping it", None
        elif issue_type == "missing_values":
            suggestion, operation = f"Fill or drop {count} missing value(s) in '{column}'", "fillEmpty"
        elif issue_type == "outliers":
            suggestion, operation = f"Review {count} outlier value(s) in '{column}'", None
        elif issue_type == "type_mismatch" and issue["severity"] == "medium":
            suggestion, operation = f"Cast column '{column}' to its proper type", "castDataType"
        elif issue_type == "type_mismatch":
            suggestion, operation = f"Fix {count} mistyped value(s) in '{column}', then cast the column", None
        elif issue_type == "pattern_violation":
            suggestion, operation = f"Fix {count} value(s) in '{column}' that violate the pattern", None
        elif issue.get("subtype") == "whitespace":
            suggestion, operation = f"Trim whitespace in '{column}'", "trimWhitespace"
        elif issue.get("subtype") == "casing":
            suggestion, operation = f"Standardize casing in '{column}'", "stringReplace"
        else:
            suggestion, operation = f"Standardize the date format in '{column}'", None
        remediations.append(
            {
                "issue_type": issue_type,
                "column": column,
                "suggestion": suggestion,
                "operation": operation,
            }
        )
    return remediations


def _score(issues: list[dict[str, Any]], row_count: int, column_count: int) -> float:
    """Severity-weighted 0–100 score over the whole dataset.

    penalty = Σ weight(severity) × affected_count, normalized by total cells so
    scores are comparable across dataset sizes, then scaled by
    SCORE_PENALTY_FACTOR. The result is a heuristic: its value is relative
    (same file, before vs after cleaning), not an absolute measurement.
    """
    total_cells = row_count * column_count
    if total_cells == 0:
        return 100.0
    penalty = sum(SEVERITY_WEIGHTS[i["severity"]] * i["count"] for i in issues)
    return max(0.0, round(100.0 - penalty / total_cells * SCORE_PENALTY_FACTOR, 1))


def _column_scores(issues: list[dict[str, Any]], df: pd.DataFrame) -> dict[str, float]:
    """Per-column 0–100 health scores from that column's issues alone."""
    row_count = len(df)
    scores = {str(c): 100.0 for c in df.columns}
    if row_count == 0:
        return scores
    for issue in issues:
        column = issue["column"]
        if column is None or column not in scores:
            continue
        penalty = SEVERITY_WEIGHTS[issue["severity"]] * issue["count"] / row_count * SCORE_PENALTY_FACTOR
        scores[column] = max(0.0, round(scores[column] - penalty, 1))
    return scores


def assess_quality(
    df: pd.DataFrame,
    rules: list[dict[str, Any]] | None = None,
    outlier_method: str = "iqr",
    outlier_sensitivity: float | None = None,
) -> dict[str, Any]:
    """Run all detectors and aggregate into a scored report.

    Args:
        df: The DataFrame to assess.
        rules: Optional pattern rules for :func:`validate_patterns`.
        outlier_method: "iqr" or "zscore".
        outlier_sensitivity: Fence multiplier (iqr) or |z| threshold (zscore);
            None uses the method's conventional default.

    Returns:
        ``{overall_score, issue_count, issues, remediations, column_scores}``.

    Raises:
        ValueError: On an unknown outlier method or invalid pattern rule.
    """
    issues = [
        *detect_duplicates(df),
        *detect_missing_values(df),
        *detect_outliers(df, method=outlier_method, sensitivity=outlier_sensitivity),
        *detect_type_mismatches(df),
        *validate_patterns(df, rules or []),
        *detect_inconsistent_formats(df),
    ]
    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    issues.sort(key=lambda i: severity_rank[i["severity"]])
    return {
        "overall_score": _score(issues, len(df), len(df.columns)),
        "issue_count": len(issues),
        "issues": issues,
        "remediations": suggest_remediations(issues),
        "column_scores": _column_scores(issues, df),
    }
