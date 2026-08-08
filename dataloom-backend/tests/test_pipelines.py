"""Tests for reusable transformation pipelines."""

import uuid

import pandas as pd
import pytest

from app import models
from app.services import project_service
from app.services.pipeline_service import apply_pipeline, check_steps_compatibility, pipeline_steps
from app.services.project_service import log_transformations_or_restore
from app.services.transformation_service import TransformationError
from app.utils.pandas_helpers import read_table_safe, save_table_safe


def _upload(client, sample_csv, name):
    with open(sample_csv, "rb") as f:
        response = client.post(
            "/projects/upload",
            files={"file": ("test.csv", f, "text/csv")},
            data={"projectName": name, "projectDescription": "fixture"},
        )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


@pytest.fixture
def project_id(client, sample_csv):
    return _upload(client, sample_csv, "Pipeline Source")


@pytest.fixture
def target_project_id(client, sample_csv):
    return _upload(client, sample_csv, "Pipeline Target")


def _apply_transforms(client, project_id):
    """Apply a filter then a sort so the project has two pending log entries."""
    r1 = client.post(
        f"/projects/{project_id}/transform",
        json={
            "operation_type": "filter",
            "parameters": {"column": "age", "condition": ">", "value": "26"},
        },
    )
    assert r1.status_code == 200, r1.text
    r2 = client.post(
        f"/projects/{project_id}/transform",
        json={"operation_type": "sort", "sort_params": {"column": "name", "ascending": True}},
    )
    assert r2.status_code == 200, r2.text


def _steps_from_logs(client, project_id):
    """Build pipeline steps from a project's logs, oldest first (run order)."""
    logs = sorted(client.get(f"/logs/{project_id}").json(), key=lambda log: log["id"])
    return [{"action_type": log["action_type"], "action_details": log["action_details"]} for log in logs]


def _create_pipeline(client, project_id, name="Clean up", steps=None):
    if steps is None:
        steps = _steps_from_logs(client, project_id)
    return client.post(
        "/pipelines",
        json={"name": name, "project_id": project_id, "steps": steps},
    )


class TestCreatePipeline:
    def test_create_from_logs(self, client, project_id):
        _apply_transforms(client, project_id)
        response = _create_pipeline(client, project_id)
        assert response.status_code == 200, response.text

        body = response.json()
        assert body["name"] == "Clean up"
        assert [step["action_type"] for step in body["steps"]] == ["filter", "sort"]
        assert [step["step_order"] for step in body["steps"]] == [0, 1]

    def test_step_order_is_preserved_as_given(self, client, project_id):
        _apply_transforms(client, project_id)
        steps = list(reversed(_steps_from_logs(client, project_id)))  # sort first, then filter
        response = _create_pipeline(client, project_id, steps=steps)
        assert response.status_code == 200
        assert [step["action_type"] for step in response.json()["steps"]] == ["sort", "filter"]

    def test_from_scratch_step_without_a_matching_log(self, client, project_id):
        # A step authored in the builder, never run on this project, saves fine.
        details = {"parameters": {"column": "age", "condition": ">", "value": "26"}}
        steps = [{"action_type": "filter", "action_details": details}]
        response = _create_pipeline(client, project_id, steps=steps)
        assert response.status_code == 200
        assert [step["action_type"] for step in response.json()["steps"]] == ["filter"]

    def test_unknown_action_type_rejected(self, client, project_id):
        response = _create_pipeline(client, project_id, steps=[{"action_type": "bogus", "action_details": {}}])
        assert response.status_code == 400
        assert "unknown action type" in response.json()["detail"].lower()

    def test_addfile_step_rejected(self, client, project_id):
        response = _create_pipeline(client, project_id, steps=[{"action_type": "addFile", "action_details": {}}])
        assert response.status_code == 400
        assert "addfile" in response.json()["detail"].lower()

    def test_blank_name_rejected(self, client, project_id):
        _apply_transforms(client, project_id)
        response = _create_pipeline(client, project_id, name="   ")
        assert response.status_code == 422

    def test_empty_steps_rejected(self, client, project_id):
        response = _create_pipeline(client, project_id, steps=[])
        assert response.status_code == 422


class TestListAndDelete:
    def test_list_returns_own_pipelines(self, client, project_id):
        _apply_transforms(client, project_id)
        _create_pipeline(client, project_id)

        response = client.get("/pipelines")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.json()[0]["name"] == "Clean up"

    def test_delete_removes_pipeline_and_steps(self, client, db, project_id):
        _apply_transforms(client, project_id)
        pipeline_id = _create_pipeline(client, project_id).json()["id"]

        response = client.delete(f"/pipelines/{pipeline_id}")
        assert response.status_code == 200
        assert client.get("/pipelines").json() == []
        assert db.query(models.PipelineStep).count() == 0

    def test_unknown_pipeline_404(self, client):
        response = client.delete("/pipelines/00000000-0000-0000-0000-000000000000")
        assert response.status_code == 404


class TestCheckCompatibility:
    def test_compatible_project(self, client, project_id, target_project_id):
        _apply_transforms(client, project_id)
        pipeline_id = _create_pipeline(client, project_id).json()["id"]

        response = client.post(f"/pipelines/{pipeline_id}/check", json={"project_id": target_project_id})
        assert response.status_code == 200
        assert response.json()["compatible"] is True

    def test_incompatible_reports_failing_step(self, db, test_user):
        pipeline = models.Pipeline(name="p", owner_id=test_user.id)
        db.add(pipeline)
        db.flush()
        db.add(
            models.PipelineStep(
                pipeline_id=pipeline.id,
                step_order=0,
                action_type="filter",
                action_details={"parameters": {"column": "missing", "condition": ">", "value": "1"}},
            )
        )
        db.commit()
        db.refresh(pipeline)

        df = pd.DataFrame({"a": [1, 2]})
        result = check_steps_compatibility(df, pipeline_steps(pipeline))
        assert result.compatible is False
        assert result.failing_step == 0
        assert result.action_type == "filter"
        assert "missing" in result.reason


class TestCheckDraftSteps:
    def test_compatible_draft(self, client, project_id, target_project_id):
        _apply_transforms(client, project_id)
        steps = _steps_from_logs(client, project_id)
        response = client.post(
            "/pipelines/check-steps",
            json={"project_id": target_project_id, "steps": steps},
        )
        assert response.status_code == 200, response.text
        assert response.json()["compatible"] is True

    def test_incompatible_draft_reports_first_failing_step(self, client, target_project_id):
        trim = {"trim_whitespace_params": {"column": "name"}}
        bad_filter = {"parameters": {"column": "missing", "condition": ">", "value": "1"}}
        steps = [
            {"action_type": "trimWhitespace", "action_details": trim},
            {"action_type": "filter", "action_details": bad_filter},
        ]
        response = client.post(
            "/pipelines/check-steps",
            json={"project_id": target_project_id, "steps": steps},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["compatible"] is False
        assert body["failing_step"] == 1
        assert body["action_type"] == "filter"

    def test_add_file_draft_step_is_incompatible(self, client, target_project_id):
        steps = [
            {"action_type": "trimWhitespace", "action_details": {"trim_whitespace_params": {"column": "name"}}},
            {"action_type": "addFile", "action_details": {"add_file_params": {"file_name": "extra.csv"}}},
        ]
        response = client.post(
            "/pipelines/check-steps",
            json={"project_id": target_project_id, "steps": steps},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["compatible"] is False
        assert body["failing_step"] == 1
        assert body["action_type"] == "addFile"
        assert "addFile" in body["reason"]

    def test_pandas_native_failure_is_reported_not_a_500(self, client, target_project_id):
        """Transform functions pass user input straight to pandas, which raises its
        own error types — here AttributeError from the query parser. A step that
        cannot run is a step failure, not a server fault."""
        steps = [
            {"action_type": "advQueryFilter", "action_details": {"adv_query": {"query": "age >> 3"}}},
        ]
        response = client.post(
            "/pipelines/check-steps",
            json={"project_id": target_project_id, "steps": steps},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["compatible"] is False
        assert body["failing_step"] == 0
        assert body["action_type"] == "advQueryFilter"
        assert body["reason"]

    def test_unknown_action_type_draft_is_incompatible(self, client, target_project_id):
        """The draft check rejects what the save path rejects, rather than replaying it."""
        steps = [
            {"action_type": "trimWhitespace", "action_details": {"trim_whitespace_params": {"column": "name"}}},
            {"action_type": "notAnOperation", "action_details": {}},
        ]
        response = client.post(
            "/pipelines/check-steps",
            json={"project_id": target_project_id, "steps": steps},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["compatible"] is False
        assert body["failing_step"] == 1
        assert body["action_type"] == "notAnOperation"
        assert "Unknown action type" in body["reason"]


class TestApplyPipeline:
    def test_apply_transforms_target_and_logs_steps(self, client, project_id, target_project_id):
        _apply_transforms(client, project_id)
        pipeline_id = _create_pipeline(client, project_id).json()["id"]

        response = client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": target_project_id})
        assert response.status_code == 200, response.text

        body = response.json()
        assert body["operation_type"] == "pipeline"
        # sample_csv: ages 30, 25, 35, 30 → filter age > 26 keeps 3 rows, sorted by name.
        assert body["row_count"] == 3
        names = [row[body["columns"].index("name")] for row in body["rows"]]
        assert names == sorted(names)

        details = client.get(f"/projects/get/{target_project_id}").json()
        assert details["row_count"] == 3

        logs = client.get(f"/logs/{target_project_id}").json()
        assert sorted(log["action_type"] for log in logs) == ["filter", "sort"]

    def test_apply_restores_file_if_log_transformation_fails(
        self, client, db, project_id, target_project_id, monkeypatch
    ):
        """A logging failure must not leave the target transformed but unlogged."""
        _apply_transforms(client, project_id)
        pipeline_id = _create_pipeline(client, project_id).json()["id"]

        target = db.query(models.Project).filter(models.Project.project_id == uuid.UUID(target_project_id)).first()
        original_df = read_table_safe(target.file_path)

        from app.services import project_service

        def boom(*args, **kwargs):
            raise RuntimeError("db log failure")

        monkeypatch.setattr(project_service, "log_transformations", boom)

        with pytest.raises(RuntimeError, match="db log failure"):
            client.post(f"/pipelines/{pipeline_id}/apply", json={"project_id": target_project_id})

        assert read_table_safe(target.file_path).equals(original_df)

    def test_apply_failure_returns_400_with_step_context(self, db, test_user):
        pipeline = models.Pipeline(name="p", owner_id=test_user.id)
        db.add(pipeline)
        db.flush()
        db.add(
            models.PipelineStep(
                pipeline_id=pipeline.id,
                step_order=0,
                action_type="filter",
                action_details={"parameters": {"column": "missing", "condition": ">", "value": "1"}},
            )
        )
        db.commit()
        db.refresh(pipeline)

        df = pd.DataFrame({"a": [1, 2]})
        with pytest.raises(TransformationError, match=r"step 0 \(filter\)"):
            apply_pipeline(df, pipeline_steps(pipeline))


class TestAuthIsolation:
    def test_anonymous_cannot_list(self, anon_client):
        assert anon_client.get("/pipelines").status_code == 401

    def test_other_users_pipeline_hidden(self, client, db, project_id):
        other = models.User(email="other@test.com", password_hash="x")
        db.add(other)
        db.commit()
        db.refresh(other)

        pipeline = models.Pipeline(name="theirs", owner_id=other.id)
        db.add(pipeline)
        db.commit()
        db.refresh(pipeline)

        assert client.get("/pipelines").json() == []
        assert client.delete(f"/pipelines/{pipeline.id}").status_code == 404
        assert client.post(f"/pipelines/{pipeline.id}/check", json={"project_id": project_id}).status_code == 404
        assert client.post(f"/pipelines/{pipeline.id}/apply", json={"project_id": project_id}).status_code == 404


class TestLogTransformationsOrRestore:
    """The shared compensating write used by both the transform and the apply path."""

    def test_logs_every_entry_in_order(self, db, project_id):
        project = db.query(models.Project).filter(models.Project.project_id == uuid.UUID(project_id)).first()
        df = read_table_safe(project.file_path)

        log_transformations_or_restore(
            db,
            project.project_id,
            project.file_path,
            df,
            [("filter", {"operation_type": "filter"}), ("sort", {"operation_type": "sort"})],
        )

        logs = sorted(
            db.query(models.ProjectChangeLog).filter(models.ProjectChangeLog.project_id == project.project_id).all(),
            key=lambda log: log.change_log_id,
        )
        assert [log.action_type for log in logs] == ["filter", "sort"]

    def test_restores_the_file_and_reraises_when_logging_fails(self, db, project_id, monkeypatch):
        """The file must never stay transformed with no log behind it."""
        project = db.query(models.Project).filter(models.Project.project_id == uuid.UUID(project_id)).first()
        original_df = read_table_safe(project.file_path)

        # Stand in for the transformed data already written to disk.
        save_table_safe(original_df.head(1), project.file_path)

        def boom(*args, **kwargs):
            raise RuntimeError("db log failure")

        monkeypatch.setattr(project_service, "log_transformations", boom)

        with pytest.raises(RuntimeError, match="db log failure"):
            log_transformations_or_restore(
                db,
                project.project_id,
                project.file_path,
                original_df,
                [("filter", {"operation_type": "filter"}), ("sort", {"operation_type": "sort"})],
            )

        assert read_table_safe(project.file_path).equals(original_df)
