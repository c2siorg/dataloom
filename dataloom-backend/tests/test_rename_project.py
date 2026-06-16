"""Tests for project renaming."""

import uuid

import pandas as pd
import pytest

from app.services.project_service import create_project, rename_project


class TestRenameProject:
    def test_rename_project_updates_name(self, db, test_user):
        """rename_project should update the project's name."""
        project = create_project(
            db,
            name="Original Name",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )

        updated = rename_project(db, project, "New Name")

        assert updated.name == "New Name"

    def test_rename_project_trims_whitespace(self, db, test_user):
        """rename_project should trim leading/trailing whitespace."""
        project = create_project(
            db,
            name="Original Name",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )

        updated = rename_project(db, project, "  Trimmed Name  ")

        assert updated.name == "Trimmed Name"

    def test_rename_project_rejects_empty_name(self, db, test_user):
        """rename_project should raise ValueError for an empty name."""
        project = create_project(
            db,
            name="Original Name",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )

        with pytest.raises(ValueError, match="cannot be empty"):
            rename_project(db, project, "")

    def test_rename_project_rejects_whitespace_only_name(self, db, test_user):
        """rename_project should raise ValueError for a whitespace-only name."""
        project = create_project(
            db,
            name="Original Name",
            file_path="/tmp/test.csv",
            description="",
            owner_id=test_user.id,
        )

        with pytest.raises(ValueError, match="cannot be empty"):
            rename_project(db, project, "    ")

    def test_rename_project_endpoint_returns_updated_name(self, client, db, test_user, tmp_path):
        """PATCH /projects/{project_id}/rename should persist and return the new name."""
        original_path = tmp_path / "rename_test.csv"
        pd.DataFrame({"a": [1, 2]}).to_csv(original_path, index=False)

        project = create_project(
            db,
            name="Old Name",
            file_path=str(original_path),
            description="",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}/rename",
            json={"name": "Renamed Project"},
        )

        assert response.status_code == 200
        assert response.json()["filename"] == "Renamed Project"

    def test_rename_project_endpoint_does_not_read_project_file(self, client, db, test_user):
        """PATCH /projects/{project_id}/rename should not require the CSV file to exist."""
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/nonexistent_rename_test.csv",
            description="",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}/rename",
            json={"name": "Renamed Project"},
        )

        assert response.status_code == 200
        assert response.json()["filename"] == "Renamed Project"
        assert response.json()["project_id"] == str(project.project_id)
        assert response.json()["file_path"] == project.file_path

    def test_rename_project_endpoint_rejects_empty_name(self, client, db, test_user, tmp_path):
        """PATCH /projects/{project_id}/rename should return 422 for an empty name."""
        original_path = tmp_path / "rename_test_empty.csv"
        pd.DataFrame({"a": [1, 2]}).to_csv(original_path, index=False)

        project = create_project(
            db,
            name="Old Name",
            file_path=str(original_path),
            description="",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}/rename",
            json={"name": "   "},
        )

        assert response.status_code == 422

    def test_rename_project_endpoint_rejects_too_long_name(self, client, db, test_user, tmp_path):
        """PATCH /projects/{project_id}/rename should return 422 for an oversized name."""
        original_path = tmp_path / "rename_test_long.csv"
        pd.DataFrame({"a": [1, 2]}).to_csv(original_path, index=False)

        project = create_project(
            db,
            name="Old Name",
            file_path=str(original_path),
            description="",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}/rename",
            json={"name": "a" * 256},
        )

        assert response.status_code == 422

    def test_rename_nonexistent_project_returns_404(self, client):
        """PATCH /projects/{project_id}/rename should return 404 for a nonexistent project."""
        nonexistent_id = uuid.uuid4()

        response = client.patch(
            f"/projects/{nonexistent_id}/rename",
            json={"name": "New Name"},
        )

        assert response.status_code == 404
