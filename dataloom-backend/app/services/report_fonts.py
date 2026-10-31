"""Unicode text support for PDF Reports.

Helvetica prints only the Windows-1252 characters, so a Report keeps it for those
and hands every other character to a bundled fallback font. Text in Helvetica's
range lays out exactly as it always has, and a Latin-only Report embeds no font.
``app/assets/fonts/README.md`` covers what the fonts include and their licences.

Reportlab has no bidi support without ``rlbidi`` and its HarfBuzz shaping needs a
TrueType paragraph font, so right-to-left text is reshaped and reordered here and
reaches reportlab as already-positioned presentation forms.
"""

import unicodedata
from functools import cache
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import arabic_reshaper
from bidi import get_display
from reportlab.pdfbase.pdfmetrics import registerFont, stringWidth
from reportlab.pdfbase.ttfonts import TTFont

from app.utils.logging import get_logger

logger = get_logger(__name__)

FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

# Tried in order for each base font. Droid Sans Fallback has no bold, so bold CJK
# text prints at regular weight, and bold oblique text prints upright.
_FALLBACK_FILES = {
    "Helvetica": ("FiraGO-Regular.ttf", "DroidSansFallbackFull.ttf"),
    "Helvetica-Bold": ("FiraGO-Bold.ttf", "DroidSansFallbackFull.ttf"),
    "Helvetica-BoldOblique": ("FiraGO-Bold.ttf", "DroidSansFallbackFull.ttf"),
}

# The default configuration strips harakat, which would change the user's text.
_RESHAPER = arabic_reshaper.ArabicReshaper({"delete_harakat": False})

_FIRST_STRONG_ISOLATE = "\u2068"
_POP_DIRECTIONAL_ISOLATE = "\u2069"
_STRIP_ISOLATES = str.maketrans("", "", _FIRST_STRONG_ISOLATE + _POP_DIRECTIONAL_ISOLATE)


@cache
def _load_font(filename: str) -> TTFont | None:
    """Register one bundled font. A damaged file costs its glyphs, not the Report.

    A truncated file raises ``struct.error`` rather than ``TTFError``, so this
    catches everything.
    """
    name = f"DataLoom-{Path(filename).stem}"
    try:
        font = TTFont(name, str(FONT_DIR / filename))
        registerFont(font)
    except Exception as exc:
        logger.warning("Report font %s failed to load, its characters will not print: %s", filename, exc)
        return None
    return font


def _fallback_fonts(base_font: str) -> list[TTFont]:
    """The usable fallbacks for a base font, loaded on the first non-Latin text."""
    fonts = (_load_font(filename) for filename in _FALLBACK_FILES.get(base_font, ()))
    return [font for font in fonts if font is not None]


def _helvetica_prints(text: str) -> bool:
    try:
        text.encode("cp1252")
    except UnicodeEncodeError:
        return False
    return True


def _font_for(char: str, base_font: str) -> str:
    if _helvetica_prints(char):
        return base_font
    for font in _fallback_fonts(base_font):
        if ord(char) in font.face.charToGlyph:
            return font.fontName
    return base_font


def font_runs(text: str, base_font: str) -> list[tuple[str, str]]:
    """Split text into ``(font name, text)`` runs that the named fonts can print."""
    if _helvetica_prints(text):
        return [(base_font, text)] if text else []
    runs: list[tuple[str, str]] = []
    for char in text:
        font = _font_for(char, base_font)
        if runs and runs[-1][0] == font:
            runs[-1] = (font, runs[-1][1] + char)
        else:
            runs.append((font, char))
    return runs


def font_markup(text: str, base_font: str) -> str:
    """Paragraph markup for text, with user text escaped and fallback runs tagged."""
    return "".join(
        escape(run) if font == base_font else f'<font name="{font}">{escape(run)}</font>'
        for font, run in font_runs(text, base_font)
    )


def is_rtl(text: str) -> bool:
    """Whether text holds any right-to-left character."""
    return any(unicodedata.bidirectional(char) in ("R", "AL") for char in text)


def isolate(value: Any) -> str:
    """Keep a value from reordering the text around it.

    Without this a number after an Arabic value counts as an Arabic number, and
    the bidi algorithm pulls it and its brackets into the right-to-left run.
    """
    text = str(value)
    return f"{_FIRST_STRONG_ISOLATE}{text}{_POP_DIRECTIONAL_ISOLATE}" if is_rtl(text) else text


def _reshape(text: str) -> str:
    """Join Arabic letters into the forms their position in a word calls for."""
    cmaps = [font.face.charToGlyph for font in _fallback_fonts("Helvetica")]
    if not cmaps:
        return text
    # FiraGO draws isolated forms from the base letters and leaves the
    # presentation form code points unmapped.
    return "".join(
        char if ord(char) in cmaps[0] else unicodedata.normalize("NFKC", char) for char in _RESHAPER.reshape(text)
    )


def visual_text(text: str) -> str:
    """Reorder one line of logical text into the order its glyphs draw in."""
    if not is_rtl(text):
        return text.translate(_STRIP_ISOLATES)
    return get_display(_reshape(text)).translate(_STRIP_ISOLATES)


def _text_width(text: str, base_font: str, size: float) -> float:
    return sum(stringWidth(run, font, size) for font, run in font_runs(visual_text(text), base_font))


def break_lines(text: str, base_font: str, size: float, width: float) -> list[str]:
    """Break logical text into lines that fit a width, keeping logical order."""
    space = stringWidth(" ", base_font, size)
    lines: list[str] = []
    line: list[str] = []
    line_width = 0.0
    for word in text.split():
        word_width = _text_width(word, base_font, size)
        if line and line_width + space + word_width > width:
            lines.append(" ".join(line))
            line, line_width = [], 0.0
        line_width += word_width + (space if line else 0)
        line.append(word)
    if line:
        lines.append(" ".join(line))
    return lines


def draw_text(canvas, x: float, y: float, text: str, base_font: str, size: float) -> None:
    """Draw one line of visually ordered text, switching fonts between runs."""
    for font, run in font_runs(text, base_font):
        canvas.setFont(font, size)
        canvas.drawString(x, y, run)
        x += stringWidth(run, font, size)
