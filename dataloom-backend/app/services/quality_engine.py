"""Automated data quality engine for DataLoom.

Provides column-level profiling, duplicate detection, outlier detection,
composite quality scoring, fix suggestions, and fix application.

All analysis functions are read-only (DataFrame in, report out).
The apply_fix function is a pure transform (DataFrame in, DataFrame out)
following the same convention as transformation_service.py so that fixes
integrate naturally with the checkpoint/replay system.
"""

from dataclasses import dataclass, field
from enum import StrEnum

import pandas as pd

from app.utils.logging import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Enums & data classes
# ---------------------------------------------------------------------------


class IssueType(StrEnum):
    """Categories of data quality issues."""

    DUPLICATE_ROWS = "duplicate_rows"
    OUTLIER = "outlier"
    NULL_VALUES = "null_values"


class FixAction(StrEnum):
    """Available one-click fix operations."""

    REMOVE_DUPLICATES = "remove_duplicates"
    REMOVE_OUTLIERS = "remove_outliers"
    FILL_NULL_MEDIAN = "fill_null_median"
    FILL_NULL_MODE = "fill_null_mode"
    DROP_NULL_ROWS = "drop_null_rows"


@dataclass
class ColumnProfile:
    """Statistical profile for a single column."""

    column_name: str
    dtype: str
    null_count: int
    null_percentage: float
    unique_count: int
    unique_percentage: float
    min_value: float | str | None = None
    max_value: float | str | None = None
    mean: float | None = None
    std: float | None = None
    median: float | None = None
    top_values: list[tuple[str, int]] = field(default_factory=list)


@dataclass
class DuplicateReport:
    """Result of duplicate row detection."""

    total_duplicates: int
    duplicate_percentage: float
    duplicate_indices: list[int] = field(default_factory=list)


@dataclass
class OutlierReport:
    """Result of outlier detection for a single numeric column."""

    column_name: str
    method: str
    outlier_count: int
    outlier_percentage: float
    outlier_indices: list[int] = field(default_factory=list)
    lower_bound: float = 0.0
    upper_bound: float = 0.0


@dataclass
class FixSuggestion:
    """A proposed remediation for a detected quality issue."""

    issue_type: IssueType
    fix_action: FixAction
    description: str
    confidence: float  # 0.0 – 1.0
    affected_rows: int
    affected_columns: list[str] = field(default_factory=list)
    parameters: dict = field(default_factory=dict)


@dataclass
class QualityReport:
    """Complete quality assessment for a DataFrame."""

    score: float  # 0–100 composite
    row_count: int
    column_count: int
    column_profiles: list[ColumnProfile]
    duplicate_report: DuplicateReport
    outlier_reports: list[OutlierReport]
    fix_suggestions: list[FixSuggestion]


# ---------------------------------------------------------------------------
# Profiling
# ---------------------------------------------------------------------------


def profile_column(series: pd.Series) -> ColumnProfile:
    """Generate a statistical profile for a single column.

    Computes null/unique counts and percentages for all columns.
    For numeric columns additionally computes min, max, mean, std, median.
    Top-5 most frequent values are included for every column.

    Args:
        series: A pandas Series representing one column.

    Returns:
        A populated ColumnProfile instance.
    """
    total = len(series)
    null_count = int(series.isna().sum())
    null_pct = (null_count / total * 100) if total > 0 else 0.0
    unique_count = int(series.nunique())
    unique_pct = (unique_count / total * 100) if total > 0 else 0.0

    profile = ColumnProfile(
        column_name=str(series.name),
        dtype=str(series.dtype),
        null_count=null_count,
        null_percentage=round(null_pct, 2),
        unique_count=unique_count,
        unique_percentage=round(unique_pct, 2),
    )

    if pd.api.types.is_numeric_dtype(series):
        clean = series.dropna()
        if len(clean) > 0:
            profile.min_value = round(float(clean.min()), 4)
            profile.max_value = round(float(clean.max()), 4)
            profile.mean = round(float(clean.mean()), 4)
            profile.std = round(float(clean.std()), 4)
            profile.median = round(float(clean.median()), 4)

    top = series.value_counts().head(5)
    profile.top_values = [(str(val), int(cnt)) for val, cnt in top.items()]

    return profile


def profile_dataframe(df: pd.DataFrame) -> list[ColumnProfile]:
    """Profile every column in the DataFrame.

    Args:
        df: Source DataFrame.

    Returns:
        One ColumnProfile per column.
    """
    return [profile_column(df[col]) for col in df.columns]


# ---------------------------------------------------------------------------
# Detection
# ---------------------------------------------------------------------------


def detect_duplicates(df: pd.DataFrame) -> DuplicateReport:
    """Identify exact duplicate rows.

    Marks duplicates keeping the first occurrence; only subsequent copies are
    counted as duplicates.

    Args:
        df: Source DataFrame.

    Returns:
        DuplicateReport with counts and sample indices (capped at 100).
    """
    mask = df.duplicated(keep="first")
    dup_indices = mask[mask].index.tolist()
    total = len(df)
    count = len(dup_indices)
    pct = (count / total * 100) if total > 0 else 0.0

    return DuplicateReport(
        total_duplicates=count,
        duplicate_percentage=round(pct, 2),
        duplicate_indices=dup_indices[:100],
    )


def detect_outliers(
    df: pd.DataFrame,
    method: str = "iqr",
    threshold: float = 1.5,
) -> list[OutlierReport]:
    """Detect outliers in every numeric column.

    Methods:
        * 'iqr'    – values outside [Q1 - t*IQR, Q3 + t*IQR]
        * 'zscore' – values with |z-score| > threshold (default 3.0 recommended)

    Args:
        df: Source DataFrame.
        method: Detection method ('iqr' or 'zscore').
        threshold: Sensitivity parameter.

    Returns:
        One OutlierReport per numeric column that contains outliers.
    """
    reports: list[OutlierReport] = []
    numeric_cols = df.select_dtypes(include=["number"]).columns

    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 4:
            continue

        if method == "iqr":
            q1 = float(series.quantile(0.25))
            q3 = float(series.quantile(0.75))
            iqr = q3 - q1
            lower = q1 - threshold * iqr
            upper = q3 + threshold * iqr
            outlier_mask = (df[col] < lower) | (df[col] > upper)
        elif method == "zscore":
            mean = float(series.mean())
            std = float(series.std())
            if std == 0:
                continue
            z = (df[col] - mean).abs() / std
            outlier_mask = z > threshold
            lower = mean - threshold * std
            upper = mean + threshold * std
        else:
            continue

        # Exclude NaN positions from the outlier set
        outlier_idx = df.index[outlier_mask & df[col].notna()].tolist()
        if outlier_idx:
            reports.append(
                OutlierReport(
                    column_name=col,
                    method=method,
                    outlier_count=len(outlier_idx),
                    outlier_percentage=round(len(outlier_idx) / len(df) * 100, 2),
                    outlier_indices=outlier_idx[:100],
                    lower_bound=round(lower, 4),
                    upper_bound=round(upper, 4),
                )
            )

    return reports


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


def compute_quality_score(
    df: pd.DataFrame,
    profiles: list[ColumnProfile],
    duplicate_report: DuplicateReport,
    outlier_reports: list[OutlierReport],
) -> float:
    """Compute a composite 0–100 quality score.

    Dimensions and weights:
        * Completeness (inverse of average null %)  – 35 %
        * Uniqueness   (inverse of duplicate %)     – 35 %
        * Consistency  (inverse of average outlier %)– 30 %

    Args:
        df: Source DataFrame.
        profiles: Column profiles from profile_dataframe().
        duplicate_report: From detect_duplicates().
        outlier_reports: From detect_outliers().

    Returns:
        Float score between 0 and 100.
    """
    if len(df) == 0:
        return 0.0

    # Completeness
    if profiles:
        avg_null_pct = sum(p.null_percentage for p in profiles) / len(profiles)
        completeness = 100.0 - avg_null_pct
    else:
        completeness = 100.0

    # Uniqueness
    uniqueness = 100.0 - duplicate_report.duplicate_percentage

    # Consistency
    if outlier_reports:
        avg_outlier_pct = sum(r.outlier_percentage for r in outlier_reports) / len(outlier_reports)
        consistency = 100.0 - min(avg_outlier_pct, 100.0)
    else:
        consistency = 100.0

    score = completeness * 0.35 + uniqueness * 0.35 + consistency * 0.30
    return round(max(0.0, min(100.0, score)), 1)


# ---------------------------------------------------------------------------
# Fix suggestions
# ---------------------------------------------------------------------------


def suggest_fixes(
    profiles: list[ColumnProfile],
    duplicate_report: DuplicateReport,
    outlier_reports: list[OutlierReport],
) -> list[FixSuggestion]:
    """Generate ranked fix suggestions with confidence scores.

    Rules:
        * Exact duplicates → REMOVE_DUPLICATES (confidence scales with dup %).
        * Nulls < 50 % in a numeric column → FILL_NULL_MEDIAN.
        * Nulls < 50 % in a string column → FILL_NULL_MODE.
        * Outliers → REMOVE_OUTLIERS (confidence inversely proportional to %).

    Args:
        profiles: Column profiles.
        duplicate_report: Duplicate detection results.
        outlier_reports: Outlier detection results.

    Returns:
        List of FixSuggestion objects sorted by confidence descending.
    """
    fixes: list[FixSuggestion] = []

    # --- duplicates -----------------------------------------------------------
    if duplicate_report.total_duplicates > 0:
        pct = duplicate_report.duplicate_percentage
        confidence = min(0.99, 0.80 + pct / 100)
        fixes.append(
            FixSuggestion(
                issue_type=IssueType.DUPLICATE_ROWS,
                fix_action=FixAction.REMOVE_DUPLICATES,
                description=(
                    f"Remove {duplicate_report.total_duplicates} exact duplicate rows ({pct}% of data)"
                ),
                confidence=round(confidence, 2),
                affected_rows=duplicate_report.total_duplicates,
            )
        )

    # --- nulls ----------------------------------------------------------------
    for profile in profiles:
        if profile.null_count == 0 or profile.null_percentage > 50:
            continue

        if profile.mean is not None:
            # Numeric column — fill with median
            fixes.append(
                FixSuggestion(
                    issue_type=IssueType.NULL_VALUES,
                    fix_action=FixAction.FILL_NULL_MEDIAN,
                    description=(
                        f"Fill {profile.null_count} nulls in '{profile.column_name}' "
                        f"with median ({profile.median})"
                    ),
                    confidence=0.85,
                    affected_rows=profile.null_count,
                    affected_columns=[profile.column_name],
                    parameters={"column": profile.column_name, "fill_value": profile.median},
                )
            )
        elif profile.top_values:
            # String column — fill with mode
            mode_val = profile.top_values[0][0]
            fixes.append(
                FixSuggestion(
                    issue_type=IssueType.NULL_VALUES,
                    fix_action=FixAction.FILL_NULL_MODE,
                    description=(
                        f"Fill {profile.null_count} nulls in '{profile.column_name}' "
                        f"with most frequent value ('{mode_val}')"
                    ),
                    confidence=0.70,
                    affected_rows=profile.null_count,
                    affected_columns=[profile.column_name],
                    parameters={"column": profile.column_name, "fill_value": mode_val},
                )
            )

    # --- outliers -------------------------------------------------------------
    for report in outlier_reports:
        confidence = round(0.60 + (1 - report.outlier_percentage / 100) * 0.30, 2)
        fixes.append(
            FixSuggestion(
                issue_type=IssueType.OUTLIER,
                fix_action=FixAction.REMOVE_OUTLIERS,
                description=(
                    f"Remove {report.outlier_count} outliers in '{report.column_name}' "
                    f"(outside [{report.lower_bound}, {report.upper_bound}])"
                ),
                confidence=confidence,
                affected_rows=report.outlier_count,
                affected_columns=[report.column_name],
                parameters={
                    "column": report.column_name,
                    "lower": report.lower_bound,
                    "upper": report.upper_bound,
                },
            )
        )

    fixes.sort(key=lambda f: f.confidence, reverse=True)
    return fixes


# ---------------------------------------------------------------------------
# Fix application (pure transform: DataFrame in -> DataFrame out)
# ---------------------------------------------------------------------------


def apply_fix(df: pd.DataFrame, fix: FixSuggestion) -> pd.DataFrame:
    """Apply a single fix suggestion to the DataFrame.

    Follows the same pure-function contract as transformation_service.py:
    takes a DataFrame, returns a new DataFrame, no side effects.

    Args:
        df: Source DataFrame.
        fix: The FixSuggestion to apply.

    Returns:
        DataFrame with the remediation applied.
    """
    df = df.copy()

    if fix.fix_action == FixAction.REMOVE_DUPLICATES:
        return df.drop_duplicates().reset_index(drop=True)

    if fix.fix_action == FixAction.FILL_NULL_MEDIAN:
        col = fix.parameters["column"]
        df[col] = df[col].fillna(fix.parameters["fill_value"])
        return df

    if fix.fix_action == FixAction.FILL_NULL_MODE:
        col = fix.parameters["column"]
        df[col] = df[col].fillna(fix.parameters["fill_value"])
        return df

    if fix.fix_action == FixAction.REMOVE_OUTLIERS:
        col = fix.parameters["column"]
        lower = fix.parameters["lower"]
        upper = fix.parameters["upper"]
        mask = ((df[col] >= lower) & (df[col] <= upper)) | df[col].isna()
        return df[mask].reset_index(drop=True)

    if fix.fix_action == FixAction.DROP_NULL_ROWS:
        return df.dropna(subset=fix.affected_columns).reset_index(drop=True)

    logger.warning("Unknown fix action: %s — returning DataFrame unchanged", fix.fix_action)
    return df


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


def run_quality_assessment(df: pd.DataFrame) -> QualityReport:
    """Run the full quality pipeline on a DataFrame.

    Steps: profile -> detect duplicates -> detect outliers -> score -> suggest fixes.

    Args:
        df: Source DataFrame.

    Returns:
        A complete QualityReport.
    """
    profiles = profile_dataframe(df)
    dup_report = detect_duplicates(df)
    outlier_reports = detect_outliers(df)
    score = compute_quality_score(df, profiles, dup_report, outlier_reports)
    fixes = suggest_fixes(profiles, dup_report, outlier_reports)

    logger.info(
        "Quality assessment complete: score=%.1f, duplicates=%d, outlier_cols=%d, fixes=%d",
        score,
        dup_report.total_duplicates,
        len(outlier_reports),
        len(fixes),
    )

    return QualityReport(
        score=score,
        row_count=len(df),
        column_count=len(df.columns),
        column_profiles=profiles,
        duplicate_report=dup_report,
        outlier_reports=outlier_reports,
        fix_suggestions=fixes,
    )
