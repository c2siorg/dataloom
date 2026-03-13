import numpy as np
import pandas as pd


def assess_quality(df: pd.DataFrame) -> dict:
    dup_result = detect_duplicates(df)
    outlier_result = detect_outliers(df)
    missing_result = analyze_missing(df)
    pattern_result = detect_pattern_issues(df)

    dup_score = max(0, 100 - dup_result["duplicate_percentage"] * 5)
    outlier_pct = outlier_result["total_outlier_percentage"]
    outlier_score = max(0, 100 - outlier_pct * 3)
    missing_score = max(0, 100 - missing_result["missing_percentage"] * 2)
    pattern_score = max(0, 100 - pattern_result["issue_count"] * 5)

    overall = round(
        dup_score * 0.25 + outlier_score * 0.25 + missing_score * 0.3 + pattern_score * 0.2, 1
    )

    suggestions = _generate_suggestions(dup_result, outlier_result, missing_result, pattern_result)

    return {
        "overall_score": min(100, max(0, overall)),
        "duplicates": dup_result,
        "outliers": outlier_result,
        "missing": missing_result,
        "pattern_issues": pattern_result,
        "suggestions": suggestions,
    }


def detect_duplicates(df: pd.DataFrame) -> dict:
    dup_mask = df.duplicated(keep=False)
    dup_count = int(dup_mask.sum())
    total = len(df)
    return {
        "exact_duplicate_count": dup_count,
        "duplicate_percentage": round((dup_count / total) * 100, 2) if total > 0 else 0,
        "duplicate_row_indices": df[dup_mask].index.tolist()[:100],
    }


def detect_outliers(df: pd.DataFrame, method: str = "iqr") -> dict:
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    column_outliers = {}
    total_outliers = 0
    total_values = 0

    for col in numeric_cols:
        series = df[col].dropna()
        if len(series) < 4:
            continue

        total_values += len(series)

        if method == "iqr":
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
            outlier_mask = (series < lower) | (series > upper)
        else:
            mean = series.mean()
            std = series.std()
            if std == 0:
                continue
            z_scores = ((series - mean) / std).abs()
            outlier_mask = z_scores > 3

        count = int(outlier_mask.sum())
        if count > 0:
            total_outliers += count
            column_outliers[col] = {
                "count": count,
                "percentage": round((count / len(series)) * 100, 2),
                "indices": series[outlier_mask].index.tolist()[:50],
            }

    return {
        "method": method,
        "columns": column_outliers,
        "total_outlier_count": total_outliers,
        "total_outlier_percentage": round((total_outliers / total_values) * 100, 2) if total_values > 0 else 0,
    }


def analyze_missing(df: pd.DataFrame) -> dict:
    total_cells = df.size
    missing_total = int(df.isnull().sum().sum())
    columns = {}
    for col in df.columns:
        mc = int(df[col].isnull().sum())
        if mc > 0:
            columns[col] = {
                "count": mc,
                "percentage": round((mc / len(df)) * 100, 2),
            }
    return {
        "total_missing": missing_total,
        "missing_percentage": round((missing_total / total_cells) * 100, 2) if total_cells > 0 else 0,
        "columns": columns,
    }


def detect_pattern_issues(df: pd.DataFrame) -> dict:
    issues = []
    string_cols = df.select_dtypes(include=["object"]).columns

    for col in string_cols:
        series = df[col].dropna()
        if len(series) == 0:
            continue

        ws_count = int(series.str.strip().ne(series).sum())
        if ws_count > 0:
            issues.append({
                "column": col,
                "issue": "leading_trailing_whitespace",
                "count": ws_count,
            })

        numeric_like = series.apply(_is_numeric_string)
        numeric_pct = numeric_like.mean()
        if 0.5 < numeric_pct < 1.0:
            issues.append({
                "column": col,
                "issue": "mixed_numeric_strings",
                "count": int((~numeric_like).sum()),
            })

    return {
        "issues": issues,
        "issue_count": len(issues),
    }


def _is_numeric_string(val) -> bool:
    try:
        float(str(val).strip())
        return True
    except (ValueError, TypeError):
        return False


def apply_quality_fix(df: pd.DataFrame, fix_type: str, params: dict) -> pd.DataFrame:
    df = df.copy()

    if fix_type == "drop_duplicates":
        return df.drop_duplicates()

    elif fix_type == "fill_missing":
        col = params.get("column")
        strategy = params.get("strategy", "mean")
        if col and col in df.columns:
            if strategy == "mean" and pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df[col].fillna(df[col].mean())
            elif strategy == "median" and pd.api.types.is_numeric_dtype(df[col]):
                df[col] = df[col].fillna(df[col].median())
            elif strategy == "mode":
                mode_val = df[col].mode()
                if len(mode_val) > 0:
                    df[col] = df[col].fillna(mode_val.iloc[0])
            else:
                df[col] = df[col].fillna(params.get("value", ""))
        return df

    elif fix_type == "trim_whitespace":
        for col in df.select_dtypes(include=["object"]).columns:
            df[col] = df[col].str.strip()
        return df

    elif fix_type == "remove_outliers":
        col = params.get("column")
        if col and col in df.columns and pd.api.types.is_numeric_dtype(df[col]):
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            return df[(df[col] >= q1 - 1.5 * iqr) & (df[col] <= q3 + 1.5 * iqr)]
        return df

    else:
        return df


def _generate_suggestions(dup_result, outlier_result, missing_result, pattern_result) -> list[dict]:
    suggestions = []

    if dup_result["exact_duplicate_count"] > 0:
        suggestions.append({
            "fix_type": "drop_duplicates",
            "description": f"Remove {dup_result['exact_duplicate_count']} duplicate rows",
            "params": {},
        })

    for col, info in missing_result["columns"].items():
        if info["percentage"] < 50:
            suggestions.append({
                "fix_type": "fill_missing",
                "description": f"Fill {info['count']} missing values in '{col}'",
                "params": {"column": col, "strategy": "mean"},
            })

    for issue in pattern_result["issues"]:
        if issue["issue"] == "leading_trailing_whitespace":
            suggestions.append({
                "fix_type": "trim_whitespace",
                "description": f"Trim whitespace in '{issue['column']}' ({issue['count']} values)",
                "params": {},
            })
            break

    for col, info in outlier_result["columns"].items():
        if info["percentage"] > 5:
            suggestions.append({
                "fix_type": "remove_outliers",
                "description": f"Remove {info['count']} outliers in '{col}'",
                "params": {"column": col},
            })

    return suggestions
