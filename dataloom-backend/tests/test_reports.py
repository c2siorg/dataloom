"""Tests for PDF project report generation."""

import unicodedata
from unittest.mock import patch

import pandas as pd
import pytest

from app import models
from app.api.endpoints.reports import _attachment_filename
from app.schemas import OperationType, ReportSection
from app.services import project_service
from app.services.profiling_service import all_column_profiles, dataset_summary
from app.services.quality_service import assess_quality
from app.services.report_fonts import (
    _load_font,
    break_lines,
    font_markup,
    font_runs,
    isolate,
    visual_text,
)
from app.services.report_service import build_report
from app.services.transformation_service import TRANSFORMATION_REGISTRY, operation_label, operation_summary


@pytest.fixture
def project_id(client, sample_csv):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": "Report Project", "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


class TestOperationLabels:
    def test_every_operation_has_a_label(self):
        missing = [op for op, spec in TRANSFORMATION_REGISTRY.items() if not spec.label]
        assert missing == []

    def test_label_is_human_readable(self):
        assert operation_label(OperationType.castDataType) == "Cast data type"
        assert operation_label("dropDuplicate") == "Drop duplicates"

    def test_unknown_operation_falls_back_to_its_raw_name(self):
        assert operation_label("someFutureOp") == "someFutureOp"

    def test_summary_renders_the_operation_parameters(self):
        summary = operation_summary(
            OperationType.filter,
            {"parameters": {"column": "price", "condition": "greater than", "value": "10"}},
        )
        assert "price" in summary
        assert "greater than" in summary

    def test_summary_is_empty_when_there_are_no_parameters(self):
        assert operation_summary(OperationType.dropNa, {}) == ""


class TestBuildReport:
    def _frame(self):
        return pd.DataFrame(
            {
                "price": [10.5, 20.0, None],
                "city": ["Paris", "Lyon", "Paris"],
                "active": [True, False, True],
            }
        )

    def _build(self, df, name="Sample", **kwargs):
        return build_report(name, dataset_summary(df), **kwargs)

    def test_overview_only_produces_a_valid_pdf(self):
        pdf = self._build(self._frame())
        assert pdf.startswith(b"%PDF")
        assert b"%%EOF" in pdf[-32:]

    def test_every_section_together_produces_a_valid_pdf(self):
        df = self._frame()
        pdf = self._build(
            df,
            profiles=all_column_profiles(df)["profiles"],
            quality=assess_quality(df),
            provenance={
                "files": [{"filename": "sales.csv", "uploaded_at": "2026-08-01 09:00 UTC"}],
                "checkpoints": [
                    {
                        "message": "Cleaned prices",
                        "created_at": "2026-08-01 10:00 UTC",
                        "transformations": [
                            {"label": "Filter", "summary": "column: price", "timestamp": "2026-08-01 09:30 UTC"}
                        ],
                    }
                ],
                "unsaved": [],
            },
        )
        assert pdf.startswith(b"%PDF")

    def test_sections_change_the_document(self):
        df = self._frame()
        overview_only = self._build(df)
        with_profiles = self._build(df, profiles=all_column_profiles(df)["profiles"])
        assert len(with_profiles) > len(overview_only)

    def test_empty_dataframe_produces_a_valid_pdf(self):
        df = pd.DataFrame()
        pdf = self._build(df, profiles=[], quality=assess_quality(df))
        assert pdf.startswith(b"%PDF")

    def test_project_with_no_history_produces_a_valid_pdf(self):
        pdf = self._build(
            self._frame(),
            provenance={"files": [], "checkpoints": [], "unsaved": []},
        )
        assert pdf.startswith(b"%PDF")

    def test_markup_in_names_is_escaped(self):
        df = pd.DataFrame({"<b>bold</b>": [1, 2]})
        pdf = self._build(df, name="<i>Sneaky & Co</i>", profiles=all_column_profiles(df)["profiles"])
        assert pdf.startswith(b"%PDF")

    def test_markup_in_provenance_is_escaped(self):
        pdf = self._build(
            self._frame(),
            provenance={
                "files": [{"filename": "<b>x</b>.csv", "uploaded_at": "now"}],
                "checkpoints": [
                    {
                        "message": "<i>save</i> & go",
                        "created_at": "now",
                        "transformations": [{"label": "Filter", "summary": "a & b", "timestamp": "now"}],
                    }
                ],
                "unsaved": [],
            },
        )
        assert pdf.startswith(b"%PDF")


CHINESE = "中文数据集"
ARABIC = "مرحبا"
CJK_FONT = b"DroidSansFallback"
FIRA_REGULAR = b"FiraGO-Regular"
FIRA_BOLD = b"FiraGO-Bold"


def _pdf(name="Sample", column="city", value="Paris", filename="sales.csv", message="Cleaned"):
    df = pd.DataFrame({column: [value, value, None]})
    return build_report(
        name,
        dataset_summary(df),
        profiles=all_column_profiles(df)["profiles"],
        quality=assess_quality(df),
        provenance={
            "files": [{"filename": filename, "uploaded_at": "now"}],
            "checkpoints": [{"message": message, "created_at": "now", "transformations": []}],
            "unsaved": [],
        },
    )


class TestUnicodeReports:
    @pytest.mark.parametrize("field", ["name", "column", "value", "filename", "message"])
    def test_chinese_text_embeds_the_cjk_font_wherever_it_appears(self, field):
        pdf = _pdf(**{field: CHINESE})
        assert CJK_FONT in pdf
        assert b"/FontFile2" in pdf

    @pytest.mark.parametrize("field", ["column", "value", "filename"])
    def test_arabic_text_embeds_the_regular_font_wherever_it_appears(self, field):
        assert FIRA_REGULAR in _pdf(**{field: ARABIC})

    @pytest.mark.parametrize("field", ["name", "message"])
    def test_arabic_headings_embed_the_bold_font(self, field):
        assert FIRA_BOLD in _pdf(**{field: ARABIC})

    def test_latin_report_embeds_no_font(self):
        pdf = _pdf(name="Café – “Q3”", value="Zürich")
        assert b"/FontFile2" not in pdf

    def test_long_right_to_left_cell_produces_a_valid_pdf(self):
        pdf = _pdf(column=" ".join([ARABIC] * 40), message=" ".join([ARABIC] * 40))
        assert pdf.startswith(b"%PDF")
        assert FIRA_BOLD in pdf

    def test_report_generation_leaves_the_data_unchanged(self):
        df = pd.DataFrame({CHINESE: [ARABIC, "مَرْحَبًا"]})
        before = df.copy(deep=True)
        profiles = all_column_profiles(df)["profiles"]
        profiles_before = [dict(profile) for profile in profiles]

        build_report(CHINESE, dataset_summary(df), profiles=profiles)

        pd.testing.assert_frame_equal(df, before)
        assert profiles == profiles_before


class TestReportFonts:
    def test_helvetica_keeps_every_character_it_can_print(self):
        assert font_runs("Café – “Q3” €5", "Helvetica") == [("Helvetica", "Café – “Q3” €5")]

    def test_chinese_runs_use_the_cjk_font_and_latin_stays_in_helvetica(self):
        assert font_runs(f"Q3 {CHINESE}", "Helvetica") == [
            ("Helvetica", "Q3 "),
            ("DataLoom-DroidSansFallbackFull", CHINESE),
        ]

    @pytest.mark.parametrize(
        ("base_font", "expected"),
        [
            ("Helvetica", "DataLoom-FiraGO-Regular"),
            ("Helvetica-Bold", "DataLoom-FiraGO-Bold"),
            ("Helvetica-BoldOblique", "DataLoom-FiraGO-Bold"),
        ],
    )
    def test_every_report_style_has_a_fallback(self, base_font, expected):
        assert font_runs("Привет", base_font) == [(expected, "Привет")]

    def test_character_no_font_covers_stays_in_the_base_font(self):
        assert font_runs("한", "Helvetica") == [("Helvetica", "한")]

    def test_markup_escapes_user_text_inside_font_runs(self):
        markup = font_markup(f"<b>{CHINESE}</b>", "Helvetica")
        assert "&lt;b&gt;" in markup
        assert f">{CHINESE}<" in markup

    def test_arabic_joins_its_letters_and_reverses_for_drawing(self):
        visual = visual_text(ARABIC)
        assert visual != ARABIC[::-1]  # joined presentation forms, not the isolated letters
        assert unicodedata.normalize("NFKC", visual) == ARABIC[::-1]

    def test_hebrew_reverses_for_drawing(self):
        assert visual_text("שלום") == "םולש"

    def test_latin_text_keeps_its_order(self):
        assert visual_text("abc 123") == "abc 123"

    @pytest.mark.parametrize("word", ["ابتثجحخدذرزسشصضطظعغفقكلمنهوي", "ءآأؤإئةى", "پچژگکی", "لا إله إلا الله"])
    def test_every_form_of_an_arabic_word_has_a_glyph(self, word):
        runs = font_runs(visual_text(word), "Helvetica")
        missing = [run for font, run in runs if font == "Helvetica" and run.strip()]
        assert missing == []

    def test_harakat_survive_reshaping(self):
        voweled = "مَرْحَبًا"
        marks = [char for char in voweled if unicodedata.combining(char)]
        assert [char for char in visual_text(voweled) if unicodedata.combining(char)] == marks[::-1]

    def test_isolated_value_leaves_the_surrounding_latin_in_place(self):
        visual = visual_text(f"most common “{isolate(ARABIC)}” (2), dominant 40%")
        assert visual.startswith("most common “")
        assert visual.endswith("” (2), dominant 40%")
        assert "\u2068" not in visual
        assert "\u2069" not in visual

    def test_isolate_leaves_latin_values_alone(self):
        assert isolate("Paris") == "Paris"
        assert isolate(12) == "12"

    def test_lines_break_in_logical_order(self):
        words = ["واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة"]
        lines = break_lines(" ".join(words), "Helvetica", 12, 80)
        assert len(lines) > 1
        assert lines[0].startswith(words[0])
        assert " ".join(lines) == " ".join(words)


class TestReportFontFailure:
    """A Report never depends on a font file loading."""

    @pytest.fixture
    def broken_fonts(self, tmp_path, monkeypatch):
        monkeypatch.setattr("app.services.report_fonts.FONT_DIR", tmp_path)
        _load_font.cache_clear()
        yield tmp_path
        _load_font.cache_clear()

    def test_missing_font_files_still_produce_a_report(self, broken_fonts):
        pdf = _pdf(name=CHINESE, column=ARABIC, value="Привет")
        assert pdf.startswith(b"%PDF")
        assert b"/FontFile2" not in pdf

    def test_corrupt_font_file_still_produces_a_report(self, broken_fonts):
        (broken_fonts / "FiraGO-Regular.ttf").write_bytes(b"not a font")
        (broken_fonts / "DroidSansFallbackFull.ttf").write_bytes(b"")
        pdf = _pdf(name=CHINESE, value=ARABIC)
        assert pdf.startswith(b"%PDF")

    def test_failed_font_logs_a_warning(self, broken_fonts):
        with patch("app.services.report_fonts.logger.warning") as warning:
            _pdf(value=CHINESE)
        assert warning.call_count == len(("FiraGO-Regular", "DroidSansFallbackFull"))


class TestCollectProvenance:
    """Grouping applied work under the checkpoint that saved it."""

    def _project(self, db, test_user):
        project = models.Project(name="P", file_path="/tmp/p.csv", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    def _log(self, db, project, action_type, details, checkpoint_id=None):
        log = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type=action_type,
            action_details=details,
            applied=True,
            checkpoint_id=checkpoint_id,
        )
        db.add(log)
        db.commit()
        return log

    def test_transformations_are_grouped_under_their_checkpoint(self, db, test_user):
        project = self._project(db, test_user)
        checkpoint = project_service.create_checkpoint(db, project.project_id, "Cleaned up")
        self._log(db, project, "trimWhitespace", {"trim_whitespace_params": {"column": "name"}}, checkpoint.id)

        provenance = project_service.collect_provenance(db, project.project_id)

        assert len(provenance["checkpoints"]) == 1
        group = provenance["checkpoints"][0]
        assert group["message"] == "Cleaned up"
        assert [t["label"] for t in group["transformations"]] == ["Trim whitespace"]
        assert group["transformations"][0]["summary"] == "column: name"

    def test_transformations_without_a_checkpoint_are_reported_as_unsaved(self, db, test_user):
        project = self._project(db, test_user)
        checkpoint = project_service.create_checkpoint(db, project.project_id, "Saved")
        self._log(db, project, "sort", {"sort_params": {"column": "age"}}, checkpoint.id)
        self._log(db, project, "dropNa", {})

        provenance = project_service.collect_provenance(db, project.project_id)

        assert [t["label"] for t in provenance["checkpoints"][0]["transformations"]] == ["Sort"]
        assert [t["label"] for t in provenance["unsaved"]] == ["Drop missing values"]

    def test_unapplied_transformations_are_left_out(self, db, test_user):
        project = self._project(db, test_user)
        db.add(
            models.ProjectChangeLog(
                project_id=project.project_id,
                action_type="sort",
                action_details={"sort_params": {"column": "age"}},
                applied=False,
            )
        )
        db.commit()

        provenance = project_service.collect_provenance(db, project.project_id)

        assert provenance["unsaved"] == []
        assert provenance["checkpoints"] == []

    def test_project_without_history_reports_empty_groups(self, db, test_user):
        project = self._project(db, test_user)
        assert project_service.collect_provenance(db, project.project_id) == {
            "files": [],
            "checkpoints": [],
            "unsaved": [],
        }


class TestReportEndpoint:
    def test_download_report(self, client, project_id):
        response = client.get(f"/projects/{project_id}/report")
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert 'filename="Report_Project_report.pdf"' in response.headers["content-disposition"]
        assert response.content.startswith(b"%PDF")

    def test_non_latin_project_downloads_with_its_font_embedded(self, client, tmp_path):
        csv_path = tmp_path / "unicode.csv"
        csv_path.write_text(f"{CHINESE},{ARABIC}\n北京,1\n上海,2\n", encoding="utf-8")
        with open(csv_path, "rb") as f:
            upload = client.post(
                "/projects/upload",
                files={"file": ("unicode.csv", f, "text/csv")},
                data={"projectName": CHINESE, "projectDescription": "fixture"},
            )
        assert upload.status_code == 200, upload.text

        response = client.get(f"/projects/{upload.json()['project_id']}/report")

        assert response.status_code == 200
        assert 'filename="project_report.pdf"' in response.headers["content-disposition"]
        assert CJK_FONT in response.content
        assert FIRA_REGULAR in response.content

    def test_latin1_project_name_keeps_its_accents_in_the_filename(self):
        assert _attachment_filename("Café Q3") == "Café_Q3_report.pdf"

    def test_sections_are_selectable(self, client, project_id):
        full = client.get(f"/projects/{project_id}/report")
        overview = client.get(
            f"/projects/{project_id}/report",
            params={"section": [ReportSection.overview.value]},
        )
        assert overview.status_code == 200
        assert overview.content.startswith(b"%PDF")
        assert len(overview.content) < len(full.content)

    def test_unknown_section_rejected(self, client, project_id):
        response = client.get(f"/projects/{project_id}/report", params={"section": ["charts"]})
        assert response.status_code == 422

    def test_anonymous_rejected(self, anon_client, project_id):
        assert anon_client.get(f"/projects/{project_id}/report").status_code == 401

    def test_unknown_project_404(self, client):
        response = client.get("/projects/00000000-0000-0000-0000-000000000000/report")
        assert response.status_code == 404
