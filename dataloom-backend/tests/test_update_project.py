"""Tests for updating project metadata."""

import pytest

from app.services.project_service import create_project, update_project


class TestUpdateProject:
    def test_update_project_trims_name(self, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        updated = update_project(db, project, "  New Name  ", None)

        assert updated.name == "New Name"
        assert updated.description == "old"

    def test_update_project_rejects_empty_name(self, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        with pytest.raises(ValueError, match="cannot be empty"):
            update_project(db, project, "   ", None)

    def test_update_project_trims_description(self, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        updated = update_project(db, project, None, "  New description  ")

        assert updated.name == "Old Name"
        assert updated.description == "New description"


class TestUpdateProjectEndpoint:
    def test_update_project_endpoint_requires_at_least_one_field(self, client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = client.patch(f"/projects/{project.project_id}", json={})

        assert response.status_code == 422

    def test_update_project_endpoint_rejects_empty_name_after_trim(self, client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = client.patch(f"/projects/{project.project_id}", json={"name": "   "})

        assert response.status_code == 422

    def test_update_project_endpoint_updates_name(self, client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = client.patch(f"/projects/{project.project_id}", json={"name": "  New Name  "})

        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "New Name"
        assert data["description"] == "old"
        assert data["project_id"] == str(project.project_id)
        assert data["file_path"] == project.file_path

    def test_update_project_endpoint_updates_description(self, client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}",
            json={"description": "  New description  "},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "Old Name"
        assert data["description"] == "New description"

    def test_update_project_endpoint_updates_name_and_description(self, client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = client.patch(
            f"/projects/{project.project_id}",
            json={"name": "  New Name  ", "description": "  New description  "},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "New Name"
        assert data["description"] == "New description"

    def test_update_project_endpoint_requires_authentication(self, anon_client, db, test_user):
        project = create_project(
            db,
            name="Old Name",
            file_path="/tmp/test.csv",
            description="old",
            owner_id=test_user.id,
        )

        response = anon_client.patch(
            f"/projects/{project.project_id}",
            json={"name": "New Name"},
        )

        assert response.status_code == 401
