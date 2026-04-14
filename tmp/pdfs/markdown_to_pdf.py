#!/usr/bin/env python3
"""Convert a proposal-style Markdown document into a polished PDF.

This script is intentionally lightweight and tailored to structured proposal
documents with headings, paragraphs, bullet lists, and numbered lists.
"""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path

import pypdfium2 as pdfium
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, StyleSheet1, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)


HEADING_RE = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
BULLET_RE = re.compile(r"^\s*[-*]\s+(.*\S)\s*$")
NUMBERED_RE = re.compile(r"^\s*(\d+)\.\s+(.*\S)\s*$")
PAGEBREAK_RE = re.compile(r"^\[\[PAGEBREAK\]\]\s*$")

TITLE = "GSoC 2026 Proposal"
DEFAULT_SUBTITLE = "DataLoom Proposal"
INDEX_ENTRIES = [
    {
        "heading": "Cover Letter",
        "label": "Cover Letter",
        "purpose": "Formal introduction, project fit, and delivery commitment",
        "fixed_page": 2,
    },
    {
        "heading": "Index",
        "label": "Index",
        "purpose": "Front-matter guide with final PDF page references",
        "fixed_page": 3,
    },
    {
        "heading": "1. Project Snapshot",
        "label": "1. Project Snapshot",
        "purpose": "Project size, anchors, timezone, and workstream split",
    },
    {
        "heading": "2. Abstract",
        "label": "2. Abstract",
        "purpose": "High-level scope, outcomes, and delivery framing",
    },
    {
        "heading": "3. Motivation, Background, and Fit",
        "label": "3. Motivation, Background, and Fit",
        "purpose": "Prior contributions, project alignment, and readiness",
    },
    {
        "heading": "4. Technical Understanding of the Current Gap",
        "label": "4. Technical Understanding of the Current Gap",
        "purpose": "Repo-grounded gap analysis and PR #184 positioning",
    },
    {
        "heading": "5. Proposed Architecture and Workstreams",
        "label": "5. Proposed Architecture and Workstreams",
        "purpose": "Implementation plan, milestones, outputs, and success criteria",
    },
    {
        "heading": "6. Review Strategy, Testing, and Delivery",
        "label": "6. Review Strategy, Testing, and Delivery",
        "purpose": "PR strategy, testing layers, and delivery cadence",
    },
    {
        "heading": "7. Timeline",
        "label": "7. Timeline",
        "purpose": "Community bonding plan, weekly milestones, and contingencies",
    },
    {
        "heading": "8. Scope Control and Risks",
        "label": "8. Scope Control and Risks",
        "purpose": "Priority order, delivery risks, and mitigation strategy",
    },
    {
        "heading": "9. Availability and Post-GSoC Plan",
        "label": "9. Availability and Post-GSoC Plan",
        "purpose": "Time commitment, schedule reliability, and continuation plan",
    },
]


def cover_subtitle_from_heading(text: str) -> str:
    """Build the cover subtitle from the markdown H1 when present."""
    text = normalize_text(text).strip()
    text = re.sub(r"^GSoC\s*2026\s*Proposal\s*:?\s*", "", text, flags=re.IGNORECASE)
    return text or DEFAULT_SUBTITLE


def normalize_text(text: str) -> str:
    """Normalize punctuation so the built-in PDF fonts render cleanly."""
    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2015": "-",
        "\u2212": "-",
        "\u00a0": " ",
        "\u2026": "...",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def inline_text(text: str) -> str:
    """Convert lightweight markdown formatting into paragraph-safe text."""
    text = normalize_text(text)

    def replace_link(match: re.Match[str]) -> str:
        label, url = match.group(1), match.group(2)
        return f"{label} ({url})"

    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", replace_link, text)
    text = text.replace("**", "")
    text = text.replace("`", "")
    return html.escape(text, quote=False)


def parse_blocks(text: str) -> list[dict[str, object]]:
    """Turn markdown into a small block AST."""
    lines = text.splitlines()
    blocks: list[dict[str, object]] = []
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            i += 1
            continue

        if PAGEBREAK_RE.match(line):
            blocks.append({"type": "pagebreak"})
            i += 1
            continue

        heading = HEADING_RE.match(line)
        if heading:
            blocks.append(
                {
                    "type": "heading",
                    "level": len(heading.group(1)),
                    "text": heading.group(2).strip(),
                }
            )
            i += 1
            continue

        if line.startswith("```"):
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(normalize_text(lines[i].rstrip("\n")))
                i += 1
            i += 1
            blocks.append({"type": "code", "text": "\n".join(code_lines)})
            continue

        bullet = BULLET_RE.match(line)
        if bullet:
            items = []
            while i < len(lines):
                current = lines[i].rstrip()
                match = BULLET_RE.match(current)
                if not match:
                    break
                items.append(match.group(1).strip())
                i += 1
            blocks.append({"type": "ul", "items": items})
            continue

        numbered = NUMBERED_RE.match(line)
        if numbered:
            items = []
            start = int(numbered.group(1))
            while i < len(lines):
                current = lines[i].rstrip()
                match = NUMBERED_RE.match(current)
                if not match:
                    break
                items.append(match.group(2).strip())
                i += 1
            blocks.append({"type": "ol", "items": items, "start": start})
            continue

        paragraph_lines = [line.strip()]
        i += 1
        while i < len(lines):
            current = lines[i].rstrip()
            if (
                not current.strip()
                or HEADING_RE.match(current)
                or BULLET_RE.match(current)
                or NUMBERED_RE.match(current)
                or current.startswith("```")
            ):
                break
            paragraph_lines.append(current.strip())
            i += 1
        blocks.append({"type": "p", "text": " ".join(paragraph_lines)})

    return blocks


def make_styles() -> StyleSheet1:
    """Create the PDF style sheet."""
    styles = getSampleStyleSheet()

    styles.add(
        ParagraphStyle(
            name="ProposalTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=28,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#12324a"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ProposalSubtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=11.5,
            leading=15,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#47657c"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#12324a"),
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubHeading",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=14,
            textColor=colors.HexColor("#1f4d6b"),
            spaceBefore=6,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ProposalBody",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=colors.HexColor("#1b2731"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ProposalList",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.3,
            leading=14.5,
            textColor=colors.HexColor("#1b2731"),
            leftIndent=12,
            firstLineIndent=0,
            spaceAfter=2,
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetaLabel",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.6,
            leading=12,
            textColor=colors.HexColor("#12324a"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="MetaValue",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.6,
            leading=12,
            textColor=colors.HexColor("#1b2731"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=styles["Code"],
            fontName="Courier",
            fontSize=8.8,
            leading=11,
            backColor=colors.HexColor("#f3f6f8"),
            borderPadding=6,
            borderWidth=0.5,
            borderColor=colors.HexColor("#d7e1e8"),
            textColor=colors.HexColor("#203040"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="IndexIntro",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.8,
            leading=13.2,
            textColor=colors.HexColor("#47657c"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="IndexHeaderCell",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.6,
            leading=12,
            textColor=colors.white,
        )
    )
    styles.add(
        ParagraphStyle(
            name="IndexSectionCell",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.6,
            leading=12,
            textColor=colors.HexColor("#12324a"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="IndexPageCell",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.6,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#12324a"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="IndexPurposeCell",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=12,
            textColor=colors.HexColor("#1b2731"),
        )
    )
    return styles


def heading_paragraph(text: str, style: ParagraphStyle, level: int) -> Paragraph:
    """Create a heading paragraph and annotate it for page capture."""
    para = Paragraph(inline_text(text), style)
    para._proposal_heading_text = text
    para._proposal_heading_level = level
    return para


def metadata_table(items: list[str], styles: StyleSheet1) -> Table:
    """Render the project snapshot as a compact metadata table."""
    rows = []
    for item in items:
        if ":" in item:
            label, value = item.split(":", 1)
            rows.append(
                [
                    Paragraph(inline_text(label.strip() + ":"), styles["MetaLabel"]),
                    Paragraph(inline_text(value.strip()), styles["MetaValue"]),
                ]
            )
        else:
            rows.append(
                [
                    Paragraph("", styles["MetaLabel"]),
                    Paragraph(inline_text(item), styles["MetaValue"]),
                ]
            )

    table = Table(rows, colWidths=[42 * mm, 118 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f6f8fb")),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d7e1e8")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4ebf0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


def index_table(heading_pages: dict[str, int], styles: StyleSheet1) -> Table:
    """Render the generated index page with actual PDF page numbers."""
    rows = [
        [
            Paragraph("Section", styles["IndexHeaderCell"]),
            Paragraph("Page", styles["IndexHeaderCell"]),
            Paragraph("Purpose", styles["IndexHeaderCell"]),
        ]
    ]

    for entry in INDEX_ENTRIES:
        page = entry.get("fixed_page", heading_pages.get(entry["heading"], "-"))
        rows.append(
            [
                Paragraph(inline_text(entry["label"]), styles["IndexSectionCell"]),
                Paragraph(str(page), styles["IndexPageCell"]),
                Paragraph(inline_text(entry["purpose"]), styles["IndexPurposeCell"]),
            ]
        )

    table = Table(rows, colWidths=[62 * mm, 16 * mm, 96 * mm], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12324a")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f8fafc")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8fafc"), colors.HexColor("#eef3f7")]),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#d7e1e8")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d7e1e8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table


class ProposalDocTemplate(BaseDocTemplate):
    """Doc template that captures level-2 heading pages during layout."""

    def __init__(self, filename: str, **kwargs) -> None:
        super().__init__(filename, **kwargs)
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates([PageTemplate(id="proposal", frames=[frame], onPage=draw_page)])
        self.heading_pages: dict[str, int] = {}

    def afterFlowable(self, flowable) -> None:
        heading_text = getattr(flowable, "_proposal_heading_text", None)
        heading_level = getattr(flowable, "_proposal_heading_level", None)
        if heading_text and heading_level == 2:
            self.heading_pages[heading_text] = self.page


def build_story(
    blocks: list[dict[str, object]],
    styles: StyleSheet1,
    heading_pages: dict[str, int] | None = None,
) -> list[object]:
    """Convert parsed blocks into Platypus flowables."""
    story: list[object] = []
    i = 0

    while i < len(blocks):
        block = blocks[i]
        btype = block["type"]

        if i == 0 and btype == "heading" and block["level"] == 1:
            story.append(Spacer(1, 6 * mm))
            story.append(Paragraph(inline_text(TITLE), styles["ProposalTitle"]))
            story.append(Paragraph(inline_text(cover_subtitle_from_heading(str(block["text"]))), styles["ProposalSubtitle"]))
            story.append(Spacer(1, 4 * mm))
            i += 1
            continue

        if btype == "heading" and block["level"] == 2 and str(block["text"]).strip().lower() == "index":
            story.append(heading_paragraph(str(block["text"]), styles["SectionHeading"], int(block["level"])))
            story.append(
                Paragraph(
                    inline_text("This index uses the final rendered PDF page numbers and a short purpose note for each front-matter and proposal section."),
                    styles["IndexIntro"],
                )
            )
            story.append(index_table(heading_pages or {}, styles))
            story.append(Spacer(1, 4 * mm))
            i += 1
            continue

        if (
            btype == "heading"
            and block["level"] == 2
            and "project snapshot" in str(block["text"]).lower()
            and i + 1 < len(blocks)
            and blocks[i + 1]["type"] == "ul"
        ):
            story.append(heading_paragraph(str(block["text"]), styles["SectionHeading"], int(block["level"])))
            story.append(metadata_table(list(blocks[i + 1]["items"]), styles))
            story.append(Spacer(1, 5 * mm))
            i += 2
            continue

        if btype == "heading":
            style_name = "SectionHeading" if block["level"] <= 2 else "SubHeading"
            story.append(heading_paragraph(str(block["text"]), styles[style_name], int(block["level"])))
            i += 1
            continue

        if btype == "pagebreak":
            story.append(PageBreak())
            i += 1
            continue

        if btype == "p":
            story.append(Paragraph(inline_text(str(block["text"])), styles["ProposalBody"]))
            i += 1
            continue

        if btype == "ul":
            for item in block["items"]:
                story.append(Paragraph(inline_text("- " + item), styles["ProposalList"]))
            story.append(Spacer(1, 2 * mm))
            i += 1
            continue

        if btype == "ol":
            start = int(block["start"])
            for offset, item in enumerate(block["items"]):
                story.append(Paragraph(inline_text(f"{start + offset}. {item}"), styles["ProposalList"]))
            story.append(Spacer(1, 2 * mm))
            i += 1
            continue

        if btype == "code":
            story.append(
                KeepTogether(
                    [
                        Preformatted(str(block["text"]), styles["CodeBlock"]),
                        Spacer(1, 3 * mm),
                    ]
                )
            )
            i += 1
            continue

        i += 1

    return story


def draw_page(canvas, doc) -> None:
    """Draw consistent footer and page accents."""
    canvas.saveState()
    width, height = A4

    canvas.setStrokeColor(colors.HexColor("#d7e1e8"))
    canvas.setLineWidth(0.6)
    canvas.line(doc.leftMargin, height - 17 * mm, width - doc.rightMargin, height - 17 * mm)
    canvas.line(doc.leftMargin, 13 * mm, width - doc.rightMargin, 13 * mm)

    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(colors.HexColor("#5f7384"))
    canvas.drawString(doc.leftMargin, 8 * mm, "DataLoom GSoC Proposal")
    canvas.drawRightString(width - doc.rightMargin, 8 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def render_previews(pdf_path: Path, preview_dir: Path, scale: float = 1.6) -> None:
    """Render PDF pages to PNG previews using pypdfium2."""
    preview_dir.mkdir(parents=True, exist_ok=True)
    for stale_preview in preview_dir.glob(f"{pdf_path.stem}-page-*.png"):
        stale_preview.unlink()

    pdf = pdfium.PdfDocument(str(pdf_path))
    try:
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            bitmap = page.render(scale=scale)
            image = bitmap.to_pil()
            image.save(preview_dir / f"{pdf_path.stem}-page-{page_index + 1:02d}.png")
            page.close()
    finally:
        pdf.close()


def convert(input_path: Path, output_path: Path, preview_dir: Path) -> None:
    """Main conversion routine."""
    source = normalize_text(input_path.read_text())
    blocks = parse_blocks(source)
    styles = make_styles()

    output_path.parent.mkdir(parents=True, exist_ok=True)

    def make_doc() -> ProposalDocTemplate:
        return ProposalDocTemplate(
            str(output_path),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=24 * mm,
            bottomMargin=18 * mm,
            title=TITLE,
            author="Nodesagar",
        )

    first_pass_doc = make_doc()
    first_pass_story = build_story(blocks, styles, {})
    first_pass_doc.build(first_pass_story)

    doc = make_doc()
    story = build_story(blocks, styles, first_pass_doc.heading_pages)
    doc.build(story)
    render_previews(output_path, preview_dir)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert proposal markdown to PDF.")
    parser.add_argument("--input", required=True, help="Input markdown path")
    parser.add_argument("--output", required=True, help="Output PDF path")
    parser.add_argument("--preview-dir", required=True, help="Directory for PNG previews")
    args = parser.parse_args()

    convert(Path(args.input), Path(args.output), Path(args.preview_dir))


if __name__ == "__main__":
    main()
