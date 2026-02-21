"""Tests for save and revert logic in the dataset service."""

import pytest
from app.services.dataset_service import (
    create_dataset,
    create_checkpoint,
    log_transformation,
)
from app import models


class TestCheckpoint:
    def test_create_checkpoint_marks_logs(self, db):
        """Creating a checkpoint should mark unapplied logs as applied."""
        # Create a dataset record
        dataset = models.Dataset(name="test", file_path="/tmp/test.csv", description="test")
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        # Log a transformation
        log_transformation(db, dataset.dataset_id, "addRow", {"row_params": {"index": 0}})

        # Verify log is unapplied
        logs = db.query(models.DatasetChangeLog).filter_by(dataset_id=dataset.dataset_id).all()
        assert len(logs) == 1
        assert logs[0].applied == False

        # Create checkpoint
        checkpoint = create_checkpoint(db, dataset.dataset_id, "First save")

        # Verify log is now applied
        db.refresh(logs[0])
        assert logs[0].applied == True
        assert logs[0].checkpoint_id == checkpoint.id

    def test_checkpoint_message(self, db):
        """Checkpoint should store the commit message."""
        dataset = models.Dataset(name="test", file_path="/tmp/test.csv", description="test")
        db.add(dataset)
        db.commit()
        db.refresh(dataset)

        checkpoint = create_checkpoint(db, dataset.dataset_id, "My save message")
        assert checkpoint.message == "My save message"
