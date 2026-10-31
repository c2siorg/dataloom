# Report fonts

PDF Reports print Windows-1252 text in Helvetica, which needs no font file. Every
other character goes to these fonts through `app/services/report_fonts.py`.

| File | Version and source | Licence | SHA-256 |
| --- | --- | --- | --- |
| `FiraGO-Regular.ttf` | 1.001, [bBoxType/FiraGO](https://github.com/bBoxType/FiraGO) `Fonts/FiraGO_TTF_1001/Roman` | SIL OFL 1.1, see `LICENSE-OFL.txt` | `495901c0c608ea265f4c31aa2a4c7a313e5cc2a3dd610da78a447fe8e07454a2` |
| `FiraGO-Bold.ttf` | 1.001, same folder | SIL OFL 1.1, see `LICENSE-OFL.txt` | `ab720753c39073556260ebbaee7e7af89f9ca202a7c7abc257d935db590a1e35` |
| `DroidSansFallbackFull.ttf` | 1.00c, AOSP `platform/frameworks/base` tag `android-8.0.0_r1`, `data/fonts` | Apache 2.0, see the repository `LICENSE` | `acb6440a713d880a13a21b468ba7cd43f5a2b2934972e51be791c880730777b8` |

The files are the unmodified upstream releases. Keep them that way: FiraGO's OFL
reserves its font name, so a subset has to ship under a different name.

## Coverage

- **FiraGO:** Latin Extended, Greek, Cyrillic, Arabic, Hebrew.
- **Droid Sans Fallback:** the 20,902 CJK Unified Ideographs, Extension A, kana, CJK
  punctuation and fullwidth forms.
- **Arabic and Hebrew:** `report_fonts.py` reshapes and reorders them, because
  reportlab's own bidi support needs `rlbidi`, which is not on PyPI. Marks sit on
  their letters at the font's default position, without contextual placement.
- **Not covered:** Hangul prints as black squares, as does anything else outside
  these fonts. FiraGO also holds Thai and Devanagari glyphs, but they print without
  shaping, so Devanagari conjuncts and vowel signs come out wrong.
- **Bold:** Droid Sans Fallback has no bold, so bold CJK text prints at regular weight.

## Packaging

The fonts live under `app/`, so the wheel (`packages = ["app"]`) and the Docker image
(`COPY . .`) both carry them. Together they add 5.6 MB. They load on the first Report
that needs them, and a Report embeds only the glyphs it uses. A Latin-only Report
loads and embeds nothing. A font that fails to load logs a warning, and the Report
still builds with its characters printed as black squares.
