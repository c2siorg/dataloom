"""Tests for project search functionality."""

from app import models
from app.services.project_service import create_project, search_projects


class TestSearchProjects:
    def test_search_matches_project_by_name(self, db, test_user):
        create_project(db, name="Sales Analysis Q1", file_path="/tmp/test.csv", description="", owner_id=test_user.id)
        create_project(db, name="Marketing Report", file_path="/tmp/test.csv", description="", owner_id=test_user.id)

        results = search_projects(db, owner_id=test_user.id, query="sales")

        assert len(results) == 1
        assert results[0].name == "Sales Analysis Q1"

    def test_search_matches_project_by_description(self, db, test_user):
        create_project(
            db,
            name="Q1 Data",
            file_path="/tmp/test.csv",
            description="Quarterly revenue breakdown",
            owner_id=test_user.id,
        )
        create_project(
            db, name="Q2 Data", file_path="/tmp/test.csv", description="Customer churn analysis", owner_id=test_user.id
        )

        results = search_projects(db, owner_id=test_user.id, query="revenue")

        assert len(results) == 1
        assert results[0].name == "Q1 Data"

    def test_search_is_case_insensitive(self, db, test_user):
        create_project(db, name="Sales Analysis", file_path="/tmp/test.csv", description="", owner_id=test_user.id)

        results = search_projects(db, owner_id=test_user.id, query="SALES")

        assert len(results) == 1

    def test_search_returns_empty_list_for_no_matches(self, db, test_user):
        create_project(db, name="Sales Analysis", file_path="/tmp/test.csv", description="", owner_id=test_user.id)

        results = search_projects(db, owner_id=test_user.id, query="nonexistent")

        assert results == []

    def test_search_does_not_return_other_users_projects(self, db, test_user):
        other_user = models.User(email="other-user@test.com", password_hash="hash")
        db.add(other_user)
        db.commit()
        db.refresh(other_user)

        create_project(db, name="Shared Name Project", file_path="/tmp/test.csv", description="", owner_id=test_user.id)
        create_project(
            db, name="Shared Name Project", file_path="/tmp/test.csv", description="", owner_id=other_user.id
        )

        results = search_projects(db, owner_id=test_user.id, query="shared")

        assert len(results) == 1
        assert all(p.owner_id == test_user.id for p in results)

    def test_search_handles_project_with_no_description(self, db, test_user):
        create_project(
            db, name="No Description Project", file_path="/tmp/test.csv", description=None, owner_id=test_user.id
        )

        results = search_projects(db, owner_id=test_user.id, query="description")

        assert len(results) == 1

    def test_search_respects_limit(self, db, test_user):
        for i in range(5):
            create_project(
                db, name=f"Test Project {i}", file_path="/tmp/test.csv", description="", owner_id=test_user.id
            )

        results = search_projects(db, owner_id=test_user.id, query="test", limit=3)

        assert len(results) == 3

    def test_search_finds_project_beyond_recent_ten(self, db, test_user):
        # Create 12 projects — the oldest would fall outside get_recent_projects' default limit of 10
        for i in range(12):
            create_project(db, name=f"Project {i}", file_path="/tmp/test.csv", description="", owner_id=test_user.id)

        results = search_projects(db, owner_id=test_user.id, query="Project 0")

        assert len(results) == 1
        assert results[0].name == "Project 0"


class TestSearchProjectsEndpoint:
    def test_search_endpoint_empty_query_returns_empty_list(self, client):
        response = client.get("/projects/search", params={"q": ""})
        assert response.status_code == 200
        assert response.json() == []

    def test_search_endpoint_whitespace_query_returns_empty_list(self, client):
        response = client.get("/projects/search", params={"q": "   "})
        assert response.status_code == 200
        assert response.json() == []

    def test_search_endpoint_returns_matching_projects(self, client, db, test_user):
        create_project(db, name="Findable Project", file_path="/tmp/test.csv", description="", owner_id=test_user.id)

        response = client.get("/projects/search", params={"q": "findable"})
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "Findable Project"

    def test_search_endpoint_requires_authentication(self, anon_client):
        response = anon_client.get("/projects/search", params={"q": "test"})
        assert response.status_code == 401
