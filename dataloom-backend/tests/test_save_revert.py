"""Tests for save and revert logic in the project service."""

import shutil

import pandas as pd

from app import models
from app.services.project_service import (
    create_checkpoint,
    create_project,
    log_transformation,
)
from app.services.transformation_service import add_column, rename_column
from app.utils.pandas_helpers import read_csv_safe, save_csv_safe


class TestCheckpoint:
    def test_create_checkpoint_marks_logs(self, db):
        """Creating a checkpoint should mark unapplied logs as applied."""
        # Create a project record
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

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

    def test_checkpoint_message(self, db):
        """Checkpoint should store the commit message."""
        project = models.Project(name="test", file_path="/tmp/test.csv", description="test")
        db.add(project)
        db.commit()
        db.refresh(project)

        checkpoint = create_checkpoint(db, project.project_id, "My save message")
        assert checkpoint.message == "My save message"


class TestSaveEndpointRegressions:
    def test_second_save_preserves_previously_checkpointed_transforms(self, client, db, tmp_path):
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

        project = create_project(db, "Cumulative Save", str(copy_path), "Regression for repeated saves")

        renamed_df = rename_column(read_csv_safe(project.file_path), 1, "years")
        save_csv_safe(renamed_df, project.file_path)
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

        extended_df = add_column(read_csv_safe(project.file_path), 3, "country")
        save_csv_safe(extended_df, project.file_path)
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
        assert read_csv_safe(project.file_path).columns.tolist() == ["name", "years", "city", "country"]
