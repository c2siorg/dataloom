"""Authentication and project ownership tests."""

from tests.conftest import register_and_login


def test_register_login_me_and_logout(anonymous_client):
    register_and_login(anonymous_client, "owner@example.com", "StrongPass123!")

    me_response = anonymous_client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "owner@example.com"

    logout_response = anonymous_client.post("/auth/jwt/logout")
    assert logout_response.status_code == 204

    me_after_logout = anonymous_client.get("/auth/me")
    assert me_after_logout.status_code == 401


def test_register_rejects_short_password(anonymous_client):
    response = anonymous_client.post(
        "/auth/register", json={"email": "short@example.com", "password": "short"}
    )

    assert response.status_code == 400
    payload = response.json()
    assert payload["detail"]["code"] == "REGISTER_INVALID_PASSWORD"


def test_projects_are_scoped_to_the_authenticated_user(anonymous_client, sample_csv):
    register_and_login(anonymous_client, "owner@example.com", "StrongPass123!")

    with open(sample_csv, "rb") as upload_file:
        upload_response = anonymous_client.post(
            "/projects/upload",
            files={"file": ("test.csv", upload_file, "text/csv")},
            data={
                "projectName": "Private Project",
                "projectDescription": "Owned by user A",
            },
        )

    assert upload_response.status_code == 200
    project_id = upload_response.json()["project_id"]

    anonymous_client.post("/auth/jwt/logout")

    register_and_login(anonymous_client, "viewer@example.com", "StrongPass456!")

    project_response = anonymous_client.get(f"/projects/get/{project_id}")
    assert project_response.status_code == 404

    recent_response = anonymous_client.get("/projects/recent")
    assert recent_response.status_code == 200
    assert recent_response.json() == []
