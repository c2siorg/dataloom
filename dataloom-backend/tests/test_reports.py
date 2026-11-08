"""Tests for PDF project report generation."""

import pandas as pd
import pytest

from app import models
from app.schemas import OperationType, ReportSection
from app.services import project_service
from app.services.profiling_service import all_column_profiles, dataset_summary
from app.services.quality_service import assess_quality
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


class TestCollectProvenance:
    """Grouping applied work under the checkpoint that saved it."""

    def _project(self, db, test_user):
        project = models.Project(name="P", file_path="/tmp/p.csv", owner_id=test_user.id)
        db.add(project)
        db.commit()
        db.refresh(project)
        return project

    def _log(self, db, project, action_type, details):
        log = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type=action_type,
            action_details=details,
            applied=True,
        )
        db.add(log)
        db.commit()
        return log

    def test_transformations_are_grouped_under_their_checkpoint(self, db, test_user):
        project = self._project(db, test_user)
        self._log(db, project, "trimWhitespace", {"trim_whitespace_params": {"column": "name"}})
        project_service.create_checkpoint(db, project.project_id, "Cleaned up")

        provenance = project_service.collect_provenance(db, project.project_id)

        assert len(provenance["checkpoints"]) == 1
        group = provenance["checkpoints"][0]
        assert group["message"] == "Cleaned up"
        assert [t["label"] for t in group["transformations"]] == ["Trim whitespace"]
        assert group["transformations"][0]["summary"] == "column: name"
        assert provenance["unsaved"] == []

    def test_every_row_lands_in_exactly_one_group(self, db, test_user):
        project = self._project(db, test_user)
        self._log(db, project, "trimWhitespace", {"trim_whitespace_params": {"column": "name"}})
        project_service.create_checkpoint(db, project.project_id, "Cleaned up")
        self._log(db, project, "sort", {"sort_params": {"column": "age"}})
        self._log(db, project, "dropNa", {})
        project_service.create_checkpoint(db, project.project_id, "Sorted")

        provenance = project_service.collect_provenance(db, project.project_id)

        grouped = [t["label"] for group in provenance["checkpoints"] for t in group["transformations"]]
        assert sorted(grouped + [t["label"] for t in provenance["unsaved"]]) == [
            "Drop missing values",
            "Sort",
            "Trim whitespace",
        ]
        # The row saved under the first checkpoint stays there.
        assert [t["label"] for t in provenance["checkpoints"][0]["transformations"]] == ["Trim whitespace"]

    def test_transformations_past_every_checkpoint_are_reported_as_unsaved(self, db, test_user):
        project = self._project(db, test_user)
        project_service.create_checkpoint(db, project.project_id, "Saved")
        self._log(db, project, "sort", {"sort_params": {"column": "age"}})

        provenance = project_service.collect_provenance(db, project.project_id)

        assert [t["label"] for t in provenance["checkpoints"][0]["transformations"]] == []
        assert [t["label"] for t in provenance["unsaved"]] == ["Sort"]

    def test_a_later_checkpoint_takes_the_rows_between_it_and_the_last_one(self, db, test_user):
        project = self._project(db, test_user)
        project_service.create_checkpoint(db, project.project_id, "First")
        self._log(db, project, "sort", {"sort_params": {"column": "age"}})
        project_service.create_checkpoint(db, project.project_id, "Second")
        self._log(db, project, "dropNa", {})

        provenance = project_service.collect_provenance(db, project.project_id)

        assert [t["label"] for t in provenance["checkpoints"][0]["transformations"]] == []
        assert [t["label"] for t in provenance["checkpoints"][1]["transformations"]] == ["Sort"]
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
