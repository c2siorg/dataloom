import io

import pandas as pd

from app.services.profiling_service import compute_profile
from app.services.quality_service import assess_quality


def export_dataframe(df: pd.DataFrame, fmt: str) -> tuple[io.BytesIO, str, str]:
    buf = io.BytesIO()

    if fmt == "csv":
        buf.write(df.to_csv(index=False).encode("utf-8"))
        return buf, "export.csv", "text/csv"

    elif fmt == "tsv":
        buf.write(df.to_csv(index=False, sep="\t").encode("utf-8"))
        return buf, "export.tsv", "text/tab-separated-values"

    elif fmt == "xlsx":
        with pd.ExcelWriter(buf, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Data")
        return buf, "export.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    elif fmt == "json":
        buf.write(df.to_json(orient="records", indent=2).encode("utf-8"))
        return buf, "export.json", "application/json"

    elif fmt == "parquet":
        df.to_parquet(buf, index=False, engine="pyarrow")
        return buf, "export.parquet", "application/octet-stream"

    else:
        raise ValueError(f"Unsupported export format: {fmt}")


def generate_quality_report_html(df: pd.DataFrame, project_name: str = "Dataset") -> str:
    profile = compute_profile(df)
    quality = assess_quality(df)

    html_parts = [
        "<!DOCTYPE html><html><head>",
        "<meta charset='utf-8'>",
        f"<title>Quality Report — {project_name}</title>",
        "<style>",
        "body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#1a1a1a}",
        "h1{color:#1e40af}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:.5rem}",
        "table{border-collapse:collapse;width:100%;margin:1rem 0}",
        "th,td{border:1px solid #d1d5db;padding:.5rem .75rem;text-align:left}",
        "th{background:#f3f4f6;font-weight:600}",
        ".score{font-size:2rem;font-weight:700;padding:1rem;border-radius:.5rem;text-align:center;margin:1rem 0}",
        ".good{background:#d1fae5;color:#065f46}.warn{background:#fef3c7;color:#92400e}.bad{background:#fee2e2;color:#991b1b}",
        ".suggestion{background:#eff6ff;border-left:4px solid #3b82f6;"
        "padding:.75rem;margin:.5rem 0;border-radius:0 .25rem .25rem 0}",
        "</style></head><body>",
    ]

    score = quality["overall_score"]
    score_class = "good" if score >= 80 else "warn" if score >= 50 else "bad"
    html_parts.append(f"<h1>Data Quality Report: {project_name}</h1>")
    html_parts.append(f'<div class="score {score_class}">Quality Score: {score}/100</div>')

    s = profile.summary
    html_parts.append("<h2>Dataset Summary</h2><table>")
    html_parts.append(f"<tr><td>Rows</td><td>{s.row_count}</td></tr>")
    html_parts.append(f"<tr><td>Columns</td><td>{s.column_count}</td></tr>")
    html_parts.append(f"<tr><td>Missing Values</td><td>{s.missing_count}</td></tr>")
    html_parts.append(f"<tr><td>Duplicate Rows</td><td>{s.duplicate_row_count}</td></tr>")
    html_parts.append(f"<tr><td>Memory Usage</td><td>{s.memory_usage_bytes:,} bytes</td></tr>")
    html_parts.append("</table>")

    html_parts.append("<h2>Column Profiles</h2><table>")
    html_parts.append("<tr><th>Column</th><th>Type</th><th>Missing</th><th>Missing %</th><th>Unique</th></tr>")
    for col in profile.columns:
        html_parts.append(
            f"<tr><td>{col.name}</td><td>{col.dtype}</td>"
            f"<td>{col.missing_count}</td><td>{col.missing_percentage:.1f}%</td>"
            f"<td>{col.unique_count}</td></tr>"
        )
    html_parts.append("</table>")

    dup = quality["duplicates"]
    html_parts.append("<h2>Duplicate Analysis</h2>")
    html_parts.append(f"<p>Exact duplicates: {dup['exact_duplicate_count']} ({dup['duplicate_percentage']}%)</p>")

    out = quality["outliers"]
    html_parts.append(f"<h2>Outlier Analysis (method: {out['method']})</h2>")
    if out["columns"]:
        html_parts.append("<table><tr><th>Column</th><th>Outliers</th><th>%</th></tr>")
        for col, info in out["columns"].items():
            html_parts.append(f"<tr><td>{col}</td><td>{info['count']}</td><td>{info['percentage']}%</td></tr>")
        html_parts.append("</table>")
    else:
        html_parts.append("<p>No outliers detected.</p>")

    if quality["suggestions"]:
        html_parts.append("<h2>Suggested Fixes</h2>")
        for sug in quality["suggestions"]:
            html_parts.append(f'<div class="suggestion">{sug["description"]}</div>')

    html_parts.append("</body></html>")
    return "".join(html_parts)
