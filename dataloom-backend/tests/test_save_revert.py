"""Tests for save and revert logic in the project service."""

import shutil
from datetime import UTC, datetime
from unittest.mock import patch

import pandas as pd
import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlmodel import Session

from app import models
from app.services.project_service import (
    create_checkpoint,
    create_project,
    get_checkpoints,
    log_transformation,
)
from app.services.transformation_service import add_column, rename_column
from app.utils.pandas_helpers import read_table_safe, save_table_safe


class TestCheckpoint:
    def test_create_checkpoint_marks_logs(self, db, test_user):
        """Creating a checkpoint should mark unapplied logs as applied."""
        project = create_project(db, name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)

        # Log a transformation
        log_transformation(db, project.project_id, "addRow", {"row_params": {"index": 0}})

        # Verify log is unapplied
        logs = db.query(models.ProjectChangeLog).filter_by(project_id=project.project_id).all()
        assert len(logs) == 1
        assert logs[0].applied is False

        # Create checkpoint
        checkpoint = create_checkpoint(db, project.project_id, "First save")

        # Verify log is now applied
        db.refresh(logs[0])
        assert logs[0].applied is True
        assert logs[0].checkpoint_id == checkpoint.id

    def test_checkpoint_message(self, db, test_user):
        """Checkpoint should store the commit message."""
        project = create_project(db, name="test", file_path="/tmp/test.csv", description="test", owner_id=test_user.id)

        checkpoint = create_checkpoint(db, project.project_id, "My save message")
        assert checkpoint.message == "My save message"


class TestSaveEndpointRegressions:
    def test_delete_checkpointed_project_removes_logs_and_checkpoints(self, client, db, test_user, tmp_path):
        """Deleting a saved project should remove dependent logs before checkpoints."""
        original_path = tmp_path / "checkpointed.csv"
        copy_path = tmp_path / "checkpointed_copy.csv"
        pd.DataFrame({"name": ["Alice"], "age": [30]}).to_csv(original_path, index=False)
        shutil.copy2(original_path, copy_path)

        project = create_project(
            db,
            name="Checkpointed Delete",
            file_path=str(copy_path),
            description="Delete regression",
            owner_id=test_user.id,
        )
        log_transformation(
            db,
            project.project_id,
            "renameCol",
            {"rename_col_params": {"col_index": 1, "new_name": "years"}},
        )
        create_checkpoint(db, project.project_id, "saved")
        project_id = project.project_id

        response = client.delete(f"/projects/{project_id}")

        assert response.status_code == 200
        assert db.get(models.Project, project_id) is None
        assert db.query(models.ProjectChangeLog).filter_by(project_id=project_id).count() == 0
        assert db.query(models.Checkpoint).filter_by(project_id=project_id).count() == 0

    def test_second_save_preserves_previously_checkpointed_transforms(self, client, db, test_user, tmp_path):
        """A later save should keep earlier checkpointed transforms intact."""
        original_path = tmp_path / "sample.csv"
        copy_path = tmp_path / "sample_copy.csv"

        pd.DataFrame(
            {
                "name": ["Alice", "Bob"],
                "age": [30, 25],
                "city": ["New York", "Los Angeles"],
            }
        ).to_csv(original_path, index=False)
        shutil.copy2(original_path, copy_path)

        project = create_project(
            db, "Cumulative Save", str(copy_path), "Regression for repeated saves", owner_id=test_user.id
        )

        renamed_df = rename_column(read_table_safe(project.file_path), 1, "years")
        save_table_safe(renamed_df, project.file_path)
        log_transformation(
            db,
            project.project_id,
            "renameCol",
            {"rename_col_params": {"col_index": 1, "new_name": "years"}},
        )

        first_save_response = client.post(
            f"/projects/{project.project_id}/save",
            params={"commit_message": "first checkpoint"},
        )
        assert first_save_response.status_code == 200
        first_save = first_save_response.json()
        assert first_save["columns"] == ["name", "years", "city"]

        extended_df = add_column(read_table_safe(project.file_path), 3, "country")
        save_table_safe(extended_df, project.file_path)
        log_transformation(
            db,
            project.project_id,
            "addCol",
            {"add_col_params": {"index": 3, "name": "country"}},
        )

        second_save_response = client.post(
            f"/projects/{project.project_id}/save",
            params={"commit_message": "second checkpoint"},
        )
        assert second_save_response.status_code == 200
        second_save = second_save_response.json()
        assert second_save["columns"] == ["name", "years", "city", "country"]
        assert read_table_safe(project.file_path).columns.tolist() == ["name", "years", "city", "country"]


class TestGetCheckpoints:
    def test_get_checkpoints_empty_project_returns_empty_list(self, db, test_user):
        """get_checkpoints should return an empty list when no checkpoints exist."""
        project = create_project(
            db, name="get-checkpoints-empty", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        result = get_checkpoints(db, project.project_id)

        assert result == []

    def test_get_checkpoints_returns_all_checkpoints(self, db, test_user):
        """get_checkpoints should return all checkpoints for a project."""
        project = create_project(
            db, name="get-checkpoints-all", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        create_checkpoint(db, project.project_id, "first save")
        create_checkpoint(db, project.project_id, "second save")
        create_checkpoint(db, project.project_id, "third save")

        result = get_checkpoints(db, project.project_id)

        assert len(result) == 3

    def test_get_checkpoints_ordered_by_created_at_desc(self, db, test_user):
        """get_checkpoints should return checkpoints newest first."""
        project = create_project(
            db, name="get-checkpoints-order", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        create_checkpoint(db, project.project_id, "first save")
        create_checkpoint(db, project.project_id, "second save")
        create_checkpoint(db, project.project_id, "third save")

        result = get_checkpoints(db, project.project_id)

        assert len(result) == 3
        messages = [c.message for c in result]
        assert set(messages) == {"first save", "second save", "third save"}
        # verify ordering — each created_at should be >= the next
        for i in range(len(result) - 1):
            assert result[i].created_at >= result[i + 1].created_at

    def test_get_checkpoints_does_not_return_other_project_checkpoints(self, db, test_user):
        """get_checkpoints should only return checkpoints for the given project."""
        project_a = create_project(
            db, name="get-checkpoints-project-a", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )
        project_b = create_project(
            db, name="get-checkpoints-project-b", file_path="/tmp/test.csv", description="", owner_id=test_user.id
        )

        create_checkpoint(db, project_a.project_id, "project a save")
        create_checkpoint(db, project_b.project_id, "project b save")

        result = get_checkpoints(db, project_a.project_id)

        assert len(result) == 1
        assert result[0].message == "project a save"


class TestRevertEndpointRegressions:
    def test_revert_replays_transformations_in_change_log_id_order(self, client, db, test_user, tmp_path):
        """Revert must replay transformations ordered by change_log_id so dependent steps succeed."""
        original_path = tmp_path / "orders.csv"
        copy_path = tmp_path / "orders_copy.csv"

        pd.DataFrame(
            {
                "name": ["Alice", "Bob"],
                "score": [10, 20],
            }
        ).to_csv(original_path, index=False)
        shutil.copy2(original_path, copy_path)

        project = create_project(
            db, "Revert Order Test", str(copy_path), "Test sequential dependencies during revert", owner_id=test_user.id
        )

        now = datetime.now(UTC)
        log1 = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type="addCol",
            action_details={"add_col_params": {"index": 2, "name": "bonus"}},
            timestamp=now,
        )
        log2 = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type="renameCol",
            action_details={"rename_col_params": {"col_index": 2, "new_name": "extra"}},
            timestamp=now,
        )
        log3 = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type="renameCol",
            action_details={"rename_col_params": {"col_index": 2, "new_name": "final_extra"}},
            timestamp=now,
        )
        log4 = models.ProjectChangeLog(
            project_id=project.project_id,
            action_type="addFormulaCol",
            action_details={"formula_col_params": {"column_name": "double_score", "expression": "score * 2"}},
            timestamp=now,
        )
        db.add_all([log1, log2, log3, log4])
        db.commit()

        checkpoint = create_checkpoint(db, project.project_id, "dependent transforms checkpoint")

        mutated_df = pd.DataFrame({"mutated": [1, 2]})
        save_table_safe(mutated_df, project.file_path)

        response = client.post(
            f"/projects/{project.project_id}/revert",
            params={"checkpoint_id": str(checkpoint.id)},
        )
        assert response.status_code == 200, response.text
        reverted = response.json()
        expected_columns = ["name", "score", "final_extra", "double_score"]
        assert reverted["columns"] == expected_columns
        assert read_table_safe(project.file_path).columns.tolist() == expected_columns

    def test_revert_restores_working_file_on_database_commit_failure(self, client, db, test_user, tmp_path):
        """Working file must be preserved if database commit fails during revert."""
        original_path = tmp_path / "data.csv"
        copy_path = tmp_path / "data_copy.csv"

        pd.DataFrame({"col_orig": [1, 2]}).to_csv(original_path, index=False)
        working_df = pd.DataFrame({"col_working": [10, 20]})
        working_df.to_csv(copy_path, index=False)

        project = create_project(
            db, "Atomic Revert Test", str(copy_path), "Test rollback on commit failure", owner_id=test_user.id
        )
        checkpoint = create_checkpoint(db, project.project_id, "checkpoint 1")

        with (
            patch.object(Session, "commit", side_effect=SQLAlchemyError("Simulated commit error")),
            pytest.raises(SQLAlchemyError),
        ):
            client.post(
                f"/projects/{project.project_id}/revert",
                params={"checkpoint_id": str(checkpoint.id)},
            )

        current_disk_df = read_table_safe(project.file_path)
        assert current_disk_df.columns.tolist() == ["col_working"]
