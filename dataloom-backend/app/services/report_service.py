"""PDF Report generation for projects.

A Report is assembled from Sections the user chose. Each section builder takes
plain dicts — the same ones the in-app views are fed — so the whole module is a
pure function of already-computed data, with no DB or file access. Passing
``None`` for a section's data omits that section.

Brand colours are copied by value from the frontend's CSS tokens
(``dataloom-frontend/src/index.css``) and the loom mark is redrawn from
``public/logo.svg``, because reportlab reads neither. See
``docs/adr/0004-reports-are-server-rendered-pdfs.md``.
"""

from datetime import UTC, datetime
from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# --- Brand ---------------------------------------------------------------

INK = colors.HexColor("#18181b")  # --app-foreground
MUTED = colors.HexColor("#71717a")  # --app-muted-foreground
RULE = colors.HexColor("#dee2e6")  # --app-border
ACCENT = colors.HexColor("#2563eb")  # --color-accent-hover
MARK = colors.HexColor("#111827")  # logo.svg fill
DANGER = colors.HexColor("#ef4444")  # --app-danger
SUCCESS = colors.HexColor("#16a34a")  # --app-success

# The loom mark from logo.svg, as (x, y, width, height) in its 100×100 viewBox.
# SVG y runs downward and reportlab's runs upward, so _LoomMark flips it.
_MARK_BARS = [
    (10, 29, 47, 12),
    (73, 29, 17, 12),
    (10, 59, 17, 12),
    (43, 59, 47, 12),
    (29, 10, 12, 17),
    (29, 43, 12, 47),
    (59, 10, 12, 47),
    (59, 73, 12, 17),
]

PAGE_WIDTH = 174 * mm  # A4 width less the 18mm margins

# One timestamp format for the whole document. Stored times are UTC, so the
# label is a constant rather than a conversion. ``project_service`` formats the
# provenance section's timestamps with this too, so a Report never mixes styles.
TIMESTAMP_FORMAT = "%d %b %Y, %H:%M UTC"


class _LoomMark(Flowable):
    """The DataLoom mark, drawn with reportlab primitives at a given size."""

    def __init__(self, size: float):
        super().__init__()
        self.width = self.height = size

    def draw(self) -> None:
        scale = self.width / 100.0
        radius = 6 * scale
        self.canv.setFillColor(MARK)
        for x, y, w, h in _MARK_BARS:
            self.canv.roundRect(
                x * scale,
                (100 - y - h) * scale,
                w * scale,
                h * scale,
                radius,
                stroke=0,
                fill=1,
            )


class _Rule(Flowable):
    """A thin full-width horizontal rule."""

    def __init__(self, color: colors.Color = RULE, thickness: float = 0.5, width: float = PAGE_WIDTH):
        super().__init__()
        self.width = width
        self.height = thickness
        self.color = color
        self.thickness = thickness

    def draw(self) -> None:
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, 0, self.width, 0)


# --- Styles --------------------------------------------------------------


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"], fontSize=20, leading=24, alignment=0, textColor=INK, spaceAfter=2
        ),
        "subtitle": ParagraphStyle("ReportSubtitle", parent=base["Normal"], fontSize=10, leading=14, textColor=MUTED),
        "section": ParagraphStyle(
            "ReportSection",
            parent=base["Heading2"],
            fontSize=12.5,
            leading=16,
            textColor=ACCENT,
            spaceBefore=0,
            spaceAfter=3,
        ),
        "sub": ParagraphStyle("ReportSub", parent=base["Heading3"], fontSize=9.5, leading=13, textColor=INK),
        "body": ParagraphStyle("ReportBody", parent=base["Normal"], fontSize=9, leading=12.5, textColor=INK),
        "note": ParagraphStyle("ReportNote", parent=base["Normal"], fontSize=8, leading=11, textColor=MUTED),
        "cell": ParagraphStyle("ReportCell", parent=base["Normal"], fontSize=8, leading=10.5, textColor=INK),
        "cellMuted": ParagraphStyle(
            "ReportCellMuted", parent=base["Normal"], fontSize=8, leading=10.5, textColor=MUTED
        ),
        "score": ParagraphStyle("ReportScore", parent=base["Normal"], fontSize=26, leading=30, textColor=INK),
    }


def _table_style(numeric_columns: tuple[int, ...] = ()) -> TableStyle:
    """Ruled-row table styling: a header underline and hairlines between rows."""
    commands = [
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("TEXTCOLOR", (0, 1), (-1, -1), INK),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, ACCENT),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for index in numeric_columns:
        commands.append(("ALIGN", (index, 0), (index, -1), "RIGHT"))
    return TableStyle(commands)


# --- Formatting ----------------------------------------------------------


def _fmt(value: Any) -> str:
    """Format one statistic for display."""
    if value is None:
        return "—"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, float):
        return f"{value:,.4g}"
    if isinstance(value, int):
        return f"{value:,}"
    return str(value)


def _short_date(value: Any) -> str:
    """Render a date the way the rest of the document does: ``01 Jan 2025``.

    Values arrive as ISO strings from profiling. A midnight time part carries no
    information for a date column, so it is dropped; any other time is kept and
    labelled UTC, matching the timestamps in the provenance section.
    """
    text = str(value)
    try:
        moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return text.replace("T", " ")
    if (moment.hour, moment.minute, moment.second) == (0, 0, 0):
        return moment.strftime("%d %b %Y")
    return moment.strftime(TIMESTAMP_FORMAT)


def _para(text: Any, style: ParagraphStyle) -> Paragraph:
    """A table cell that wraps. Paragraph parses markup, so escape user text."""
    return Paragraph(escape(str(text)), style)


def _section(title: str, styles: dict[str, ParagraphStyle]) -> list[Any]:
    return [Paragraph(escape(title), styles["section"]), _Rule(), Spacer(1, 3 * mm)]


# --- Sections ------------------------------------------------------------


def _title_block(project_name: str, styles: dict[str, ParagraphStyle]) -> list[Any]:
    generated = datetime.now(UTC).strftime(TIMESTAMP_FORMAT)
    heading = Table(
        [
            [
                _LoomMark(11 * mm),
                [
                    Paragraph(escape(project_name), styles["title"]),
                    Paragraph(f"DataLoom report · generated {generated}", styles["subtitle"]),
                ],
            ]
        ],
        colWidths=[15 * mm, PAGE_WIDTH - 15 * mm],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        ),
    )
    return [heading, Spacer(1, 7 * mm)]


def _overview_section(summary: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    """Headline dataset facts as paired label/value columns."""
    missing = summary.get("total_missing_cells")
    missing_pct = summary.get("missing_cell_percentage")
    dtype_mix = ", ".join(f"{count} {dtype}" for dtype, count in (summary.get("dtype_counts") or {}).items()) or "—"
    memory_kb = (summary.get("memory_usage_bytes") or 0) / 1024

    pairs = [
        ("Rows", _fmt(summary.get("row_count"))),
        ("Columns", _fmt(summary.get("column_count"))),
        ("Missing cells", f"{_fmt(missing)} ({missing_pct:.1f}%)" if missing_pct is not None else _fmt(missing)),
        ("Duplicate rows", _fmt(summary.get("duplicate_row_count"))),
        ("Column types", dtype_mix),
        ("Memory", f"{memory_kb:,.1f} KB"),
    ]
    # Two label/value pairs per row keeps the overview to a third of a page.
    rows = [
        [
            pairs[i][0],
            pairs[i][1],
            pairs[i + 1][0] if i + 1 < len(pairs) else "",
            pairs[i + 1][1] if i + 1 < len(pairs) else "",
        ]
        for i in range(0, len(pairs), 2)
    ]
    table = Table(
        rows,
        colWidths=[30 * mm, 57 * mm, 30 * mm, 57 * mm],
        style=TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
                ("TEXTCOLOR", (2, 0), (2, -1), MUTED),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        ),
    )
    return [*_section("Dataset overview", styles), table, Spacer(1, 8 * mm)]


def _profile_notes(profile: dict[str, Any]) -> str:
    """The stats worth showing for this column's dtype, as one line."""
    keys_by_shape = [
        ("mean", "mean"),
        ("median", "median"),
        ("std", "std"),
        ("min", "min"),
        ("max", "max"),
        ("true_percentage", "true %"),
        ("min_date", "from"),
        ("max_date", "to"),
        ("inferred_granularity", "granularity"),
    ]
    parts = [
        f"{label} {_short_date(profile[key]) if key.endswith('_date') else _fmt(profile[key])}"
        for key, label in keys_by_shape
        if profile.get(key) is not None
    ]

    # A categorical column's stats are its values, not its moments — lead with the
    # most common one, which the numeric keys above never cover.
    top_values = profile.get("top_values")
    if top_values:
        top = top_values[0]
        parts.insert(0, f"most common “{top['value']}” ({_fmt(top['count'])})")
    dominant = profile.get("dominant_value_percentage")
    if dominant is not None:
        parts.append(f"dominant {_fmt(dominant)}%")

    return ", ".join(parts) or "—"


def _profiles_section(profiles: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> list[Any]:
    """One row per column, so a wide dataset stays readable in a page or two."""
    body = _section("Column profiles", styles)
    if not profiles:
        body.append(Paragraph("The dataset has no columns.", styles["body"]))
        return [*body, Spacer(1, 8 * mm)]

    rows: list[list[Any]] = [["Column", "Type", "Nulls", "Unique", "Notes"]]
    for profile in profiles:
        nulls = profile.get("null_count")
        null_pct = profile.get("null_percentage")
        rows.append(
            [
                _para(profile.get("column", ""), styles["cell"]),
                _fmt(profile.get("dtype")),
                f"{_fmt(nulls)} ({_fmt(null_pct)}%)",
                _fmt(profile.get("unique_count")),
                _para(_profile_notes(profile), styles["cellMuted"]),
            ]
        )

    table = Table(
        rows,
        colWidths=[38 * mm, 15 * mm, 22 * mm, 16 * mm, 83 * mm],
        style=_table_style(numeric_columns=(2, 3)),
        repeatRows=1,
    )
    return [*body, table, Spacer(1, 8 * mm)]


def _quality_section(
    quality: dict[str, Any],
    settings: str,
    styles: dict[str, ParagraphStyle],
) -> list[Any]:
    score = quality.get("overall_score") or 0
    issues = quality.get("issues") or []
    remediations = quality.get("remediations") or []

    # A TEXTCOLOR table command cannot recolour a Paragraph — the paragraph's own
    # style wins — so the band colour has to be set on the style itself.
    score_style = ParagraphStyle(
        "ReportScoreBand",
        parent=styles["score"],
        textColor=DANGER if score < 70 else SUCCESS,
    )
    headline = Table(
        [
            [
                Paragraph(f"{round(score)}", score_style),
                [
                    Paragraph(
                        f"out of 100 · {len(issues)} issue(s) found" if issues else "out of 100 · no issues found",
                        styles["body"],
                    ),
                    Paragraph(escape(settings), styles["note"]),
                ],
            ]
        ],
        colWidths=[22 * mm, PAGE_WIDTH - 22 * mm],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
            ]
        ),
    )
    body = [*_section("Data quality", styles), headline, Spacer(1, 5 * mm)]

    if not issues:
        body.append(Paragraph("No quality issues were detected in this dataset.", styles["body"]))
        return [*body, Spacer(1, 8 * mm)]

    rows: list[list[Any]] = [["Severity", "Issue", "Column", "Count", "Detail"]]
    severe = []
    for index, issue in enumerate(issues, start=1):
        severity = str(issue.get("severity", ""))
        if severity in ("critical", "high"):
            severe.append(index)
        rows.append(
            [
                severity.title(),
                _fmt(issue.get("issue_type", "")).replace("_", " ").capitalize(),
                _para(issue.get("column") or "whole dataset", styles["cell"]),
                _fmt(issue.get("count")),
                _para(issue.get("detail", ""), styles["cellMuted"]),
            ]
        )

    style = _table_style(numeric_columns=(3,))
    for row in severe:
        style.add("TEXTCOLOR", (0, row), (0, row), DANGER)
    body.append(
        Table(
            rows,
            colWidths=[18 * mm, 30 * mm, 30 * mm, 15 * mm, 81 * mm],
            style=style,
            repeatRows=1,
        )
    )

    if remediations:
        body.append(Spacer(1, 5 * mm))
        body.append(Paragraph("Suggested fixes", styles["sub"]))
        for remediation in remediations:
            body.append(Paragraph(f"• {escape(str(remediation.get('suggestion', '')))}", styles["body"]))

    return [*body, Spacer(1, 8 * mm)]


def _transformation_rows(transformations: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> Table:
    rows: list[list[Any]] = []
    for transformation in transformations:
        rows.append(
            [
                _para(transformation.get("label", ""), styles["cell"]),
                _para(transformation.get("summary", ""), styles["cellMuted"]),
                _para(transformation.get("timestamp", ""), styles["cellMuted"]),
            ]
        )
    return Table(
        rows,
        colWidths=[40 * mm, 94 * mm, 40 * mm],
        style=TableStyle(
            [
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, RULE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ]
        ),
    )


def _provenance_section(provenance: dict[str, Any], styles: dict[str, ParagraphStyle]) -> list[Any]:
    """Source files, then the work grouped by the checkpoint that saved it."""
    files = provenance.get("files") or []
    checkpoints = provenance.get("checkpoints") or []
    unsaved = provenance.get("unsaved") or []

    body = _section("Provenance", styles)

    if files:
        body.append(Paragraph("Source files", styles["sub"]))
        rows: list[list[Any]] = [["File", "Added"]]
        for entry in files:
            rows.append([_para(entry.get("filename", ""), styles["cell"]), _fmt(entry.get("uploaded_at"))])
        body.append(
            Table(rows, colWidths=[124 * mm, 50 * mm], style=_table_style(), repeatRows=1),
        )
        body.append(Spacer(1, 5 * mm))

    if not checkpoints and not unsaved:
        body.append(Paragraph("No transformations have been applied to this project.", styles["body"]))
        return [*body, Spacer(1, 8 * mm)]

    for checkpoint in checkpoints:
        block = [
            Paragraph(escape(str(checkpoint.get("message", "Checkpoint"))), styles["sub"]),
            Paragraph(f"Saved {escape(str(checkpoint.get('created_at', '')))}", styles["note"]),
            Spacer(1, 1.5 * mm),
        ]
        transformations = checkpoint.get("transformations") or []
        if transformations:
            block.append(_transformation_rows(transformations, styles))
        else:
            block.append(Paragraph("No transformations in this checkpoint.", styles["note"]))
        body.append(KeepTogether(block))
        body.append(Spacer(1, 4 * mm))

    if unsaved:
        block = [
            Paragraph("Not yet saved", styles["sub"]),
            Paragraph("Applied to the working copy, but not part of a checkpoint.", styles["note"]),
            Spacer(1, 1.5 * mm),
            _transformation_rows(unsaved, styles),
        ]
        body.append(KeepTogether(block))

    return [*body, Spacer(1, 8 * mm)]


# --- Document ------------------------------------------------------------


def _page_furniture(project_name: str):
    """Return the onPage callback that draws the running footer."""

    def draw(canvas, doc) -> None:
        canvas.saveState()
        y = 12 * mm
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, y + 4 * mm, 18 * mm + PAGE_WIDTH, y + 4 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, y, f"DataLoom · {project_name}")
        canvas.drawRightString(18 * mm + PAGE_WIDTH, y, f"Page {doc.page}")
        canvas.restoreState()

    return draw


def build_report(
    project_name: str,
    summary: dict[str, Any],
    profiles: list[dict[str, Any]] | None = None,
    quality: dict[str, Any] | None = None,
    quality_settings: str = "",
    provenance: dict[str, Any] | None = None,
) -> bytes:
    """Render a project Report as PDF bytes.

    The dataset overview always prints. Every other section is included only when
    its data is passed, which is how the caller honours the user's section choice.

    Args:
        project_name: Display name of the project.
        summary: Output of ``profiling_service.dataset_summary``.
        profiles: The ``profiles`` list from ``all_column_profiles``, or None.
        quality: Output of ``quality_service.assess_quality``, or None.
        quality_settings: One line naming the detector settings used, printed
            under the score so a differing on-screen score is explainable.
        provenance: ``{files, checkpoints, unsaved}``, or None. Each checkpoint
            holds ``{message, created_at, transformations}`` and each
            transformation ``{label, summary, timestamp}``.

    Returns:
        The PDF document as bytes.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        title=f"DataLoom report — {project_name}",
        author="DataLoom",
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=22 * mm,
    )
    styles = _styles()

    story: list[Any] = [*_title_block(project_name, styles), *_overview_section(summary, styles)]
    if profiles is not None:
        story.extend(_profiles_section(profiles, styles))
    if quality is not None:
        story.extend(_quality_section(quality, quality_settings, styles))
    if provenance is not None:
        story.extend(_provenance_section(provenance, styles))

    # Trailing spacers can otherwise push an empty final page.
    while story and isinstance(story[-1], Spacer | PageBreak):
        story.pop()

    furniture = _page_furniture(project_name)
    doc.build(story, onFirstPage=furniture, onLaterPages=furniture)
    return buffer.getvalue()
