"""API tests for read-only dataset checkpoint comparison."""

import uuid
from datetime import datetime

import pandas as pd
import pytest

from app import models
from app.services.project_service import create_checkpoint, create_project, log_transformation
from app.utils.pandas_helpers import save_table_safe


def make_project(db, owner_id, tmp_path, name, original, current=None):
    original_path = tmp_path / f"{name}.csv"
    working_path = tmp_path / f"{name}_copy.csv"
    save_table_safe(original, original_path)
    save_table_safe(current if current is not None else original, working_path)
    project = create_project(db, name, str(working_path), "", owner_id)
    return project


class TestDatasetComparisonEndpoint:
    def test_success_replays_checkpoint_and_passes_independent_pages(self, client, db, test_user, tmp_path):
        original = pd.DataFrame({"id": [1, 2], "value": ["before", "same"]})
        current = pd.DataFrame({"id": [1, 2, 3, 4], "value": ["working", "changed", "new", "new"]})
        project = make_project(db, test_user.id, tmp_path, "comparison", original, current)
        log_transformation(
            db,
            project.project_id,
            "changeCellValue",
            {"change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": "saved"}},
        )
        checkpoint = create_checkpoint(db, project.project_id, "saved state")

        response = client.get(
            f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare",
            params={"row_page": 2, "cell_page": 1, "page_size": 1, "match_column": "id"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["row_page"] == 2
        assert body["cell_page"] == 1
        assert body["total_row_pages"] == 2
        assert body["total_cell_pages"] == 2
        assert body["matching_strategy"] == "identifier:id"
        assert body["rows"] == [{"type": "added", "row": 4, "checkpoint_index": None, "current_index": 3}]
        assert body["cells"] == [
            {
                "row": 1,
                "column": "value",
                "checkpoint_value": "saved",
                "current_value": "working",
            }
        ]
        # Comparison reconstruction is read-only and does not alter the working file or logs.
        assert pd.read_csv(project.file_path).equals(current)

    def test_selected_checkpoint_excludes_later_and_unapplied_transformations(self, client, db, test_user, tmp_path):
        original = pd.DataFrame({"id": [1], "value": ["original"]})
        current = pd.DataFrame({"id": [1], "value": ["working"]})
        project = make_project(db, test_user.id, tmp_path, "checkpoint-boundary", original, current)
        log_transformation(
            db,
            project.project_id,
            "changeCellValue",
            {"change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": "first-save"}},
        )
        selected = create_checkpoint(db, project.project_id, "selected checkpoint")
        selected.created_at = datetime(2025, 1, 1)
        db.add(selected)
        db.commit()

        log_transformation(
            db,
            project.project_id,
            "changeCellValue",
            {"change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": "later-save"}},
        )
        later = create_checkpoint(db, project.project_id, "later checkpoint")
        later.created_at = datetime(2025, 1, 2)
        db.add(later)
        db.commit()
        log_transformation(
            db,
            project.project_id,
            "changeCellValue",
            {"change_cell_value": {"row_index": 0, "col_index": 2, "fill_value": "unsaved"}},
        )

        response = client.get(
            f"/logs/checkpoints/{project.project_id}/{selected.id}/compare",
            params={"match_column": "id"},
        )

        assert response.status_code == 200
        assert response.json()["cells"] == [
            {
                "row": 1,
                "column": "value",
                "checkpoint_value": "first-save",
                "current_value": "working",
            }
        ]

    def test_unknown_checkpoint_returns_404(self, client, db, test_user, tmp_path):
        project = make_project(db, test_user.id, tmp_path, "unknown-checkpoint", pd.DataFrame({"x": [1]}))
        response = client.get(f"/logs/checkpoints/{project.project_id}/{uuid.uuid4()}/compare")
        assert response.status_code == 404
        assert response.json()["detail"] == "Checkpoint not found"

    def test_checkpoint_from_another_project_returns_404(self, client, db, test_user, tmp_path):
        frame = pd.DataFrame({"x": [1]})
        first = make_project(db, test_user.id, tmp_path, "project-one", frame)
        second = make_project(db, test_user.id, tmp_path, "project-two", frame)
        checkpoint = create_checkpoint(db, second.project_id, "other project")

        response = client.get(f"/logs/checkpoints/{first.project_id}/{checkpoint.id}/compare")
        assert response.status_code == 404

    def test_another_users_project_is_hidden(self, client, db, tmp_path):
        other_user = models.User(email="comparison-other@test.com", password_hash="hash")
        db.add(other_user)
        db.commit()
        db.refresh(other_user)
        project = make_project(db, other_user.id, tmp_path, "other-user", pd.DataFrame({"x": [1]}))
        checkpoint = create_checkpoint(db, project.project_id, "private checkpoint")

        response = client.get(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare")

        assert response.status_code == 404

    def test_comparison_requires_authentication(self, anon_client, db, test_user, tmp_path):
        project = make_project(db, test_user.id, tmp_path, "anonymous", pd.DataFrame({"x": [1]}))
        checkpoint = create_checkpoint(db, project.project_id, "saved")

        response = anon_client.get(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare")

        assert response.status_code == 401

    def test_invalid_match_column_returns_400(self, client, db, test_user, tmp_path):
        project = make_project(db, test_user.id, tmp_path, "invalid-match", pd.DataFrame({"x": [1]}))
        checkpoint = create_checkpoint(db, project.project_id, "saved")
        response = client.get(
            f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare",
            params={"match_column": "missing"},
        )
        assert response.status_code == 400
        assert "not present in both datasets" in response.json()["detail"]

    def test_duplicate_identifiers_return_400(self, client, db, test_user, tmp_path):
        duplicates = pd.DataFrame({"id": [1, 1]})
        project = make_project(db, test_user.id, tmp_path, "duplicate-match", duplicates)
        checkpoint = create_checkpoint(db, project.project_id, "saved")
        response = client.get(
            f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare",
            params={"match_column": "id"},
        )
        assert response.status_code == 400
        assert "unique values" in response.json()["detail"]

    @pytest.mark.parametrize("params", [{"row_page": 0}, {"cell_page": 0}, {"page_size": 0}, {"page_size": 201}])
    def test_invalid_pagination_returns_422(self, client, db, test_user, tmp_path, params):
        project = make_project(db, test_user.id, tmp_path, "invalid-page", pd.DataFrame({"x": [1]}))
        checkpoint = create_checkpoint(db, project.project_id, "saved")
        response = client.get(
            f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare",
            params=params,
        )
        assert response.status_code == 422

    def test_checkpoint_replay_failure_is_a_client_error(self, client, db, test_user, tmp_path):
        project = make_project(db, test_user.id, tmp_path, "replay-failure", pd.DataFrame({"x": [1]}))
        log_transformation(db, project.project_id, "unknown-operation", {})
        checkpoint = create_checkpoint(db, project.project_id, "invalid replay")

        response = client.get(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare")
        assert response.status_code == 400
        assert response.json()["detail"] == "Unable to reconstruct checkpoint dataset"

    def test_missing_dataset_returns_existing_file_error(self, client, db, test_user):
        project = create_project(db, "missing-file", "/tmp/not-present_copy.csv", "", test_user.id)
        checkpoint = create_checkpoint(db, project.project_id, "saved")
        response = client.get(f"/logs/checkpoints/{project.project_id}/{checkpoint.id}/compare")
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]
