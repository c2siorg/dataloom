"""Tests for authentication: signup, signin, logout, and protected routes."""


def _signup(client, email, password="testpassword"):
    """Helper: post a signup request."""
    return client.post("/auth/signup", json={"email": email, "password": password})


def _upload(client, name="A's project"):
    """Helper: upload a tiny CSV project and return its id."""
    response = client.post(
        "/projects/upload",
        files={"file": ("test.csv", b"name,age\nAlice,30\n", "text/csv")},
        data={"projectName": name, "projectDescription": "test"},
    )
    assert response.status_code == 200, response.text
    return response.json()["project_id"]


class TestSignup:
    def test_signup_success_sets_cookie(self, anon_client):
        resp = _signup(anon_client, "newuser@test.com")
        assert resp.status_code == 201
        assert "access_token" in resp.headers.get("set-cookie", "")
        body = resp.json()
        assert body["email"] == "newuser@test.com"
        assert "password_hash" not in body

    def test_signup_duplicate_email_returns_409(self, anon_client):
        _signup(anon_client, "dup@test.com")
        resp = _signup(anon_client, "dup@test.com")
        assert resp.status_code == 409

    def test_signup_invalid_email_returns_422(self, anon_client):
        resp = _signup(anon_client, "not-an-email")
        assert resp.status_code == 422

    def test_signup_short_password_returns_422(self, anon_client):
        resp = _signup(anon_client, "shortpw@test.com", password="abc")
        assert resp.status_code == 422

    def test_signup_long_password_returns_422(self, anon_client):
        resp = _signup(anon_client, "longpw@test.com", password="a" * 73)
        assert resp.status_code == 422


class TestSignin:
    def test_signin_success(self, anon_client):
        _signup(anon_client, "signin@test.com", password="mypassword1")
        anon_client.cookies.clear()
        resp = anon_client.post("/auth/signin", json={"email": "signin@test.com", "password": "mypassword1"})
        assert resp.status_code == 200
        assert "access_token" in resp.headers.get("set-cookie", "")

    def test_signin_wrong_password_returns_401(self, anon_client):
        _signup(anon_client, "wrongpw@test.com", password="correctpw1")
        resp = anon_client.post("/auth/signin", json={"email": "wrongpw@test.com", "password": "badpassword"})
        assert resp.status_code == 401

    def test_signin_unknown_email_returns_401(self, anon_client):
        resp = anon_client.post("/auth/signin", json={"email": "nobody@test.com", "password": "whatever1"})
        assert resp.status_code == 401


class TestCurrentUser:
    def test_me_with_cookie_returns_user(self, client, test_user):
        resp = client.get("/auth/me")
        assert resp.status_code == 200
        body = resp.json()
        assert body["email"] == test_user.email
        assert body["id"] == str(test_user.id)

    def test_me_without_cookie_returns_401(self, anon_client):
        resp = anon_client.get("/auth/me")
        assert resp.status_code == 401

    def test_me_with_garbage_cookie_returns_401(self, anon_client):
        resp = anon_client.get("/auth/me", headers={"Cookie": "access_token=not-a-real-token"})
        assert resp.status_code == 401


class TestLogout:
    def test_logout_clears_cookie(self, anon_client):
        _signup(anon_client, "logout@test.com")
        resp = anon_client.post("/auth/logout")
        assert resp.status_code == 200
        assert "access_token" in resp.headers.get("set-cookie", "")


class TestProtectedRoutes:
    def test_recent_requires_auth(self, anon_client):
        resp = anon_client.get("/projects/recent")
        assert resp.status_code == 401

    def test_recent_with_auth_returns_200(self, client):
        resp = client.get("/projects/recent")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


class TestOwnership:
    def test_other_users_project_returns_404(self, client, anon_client):
        project_id = _upload(client)
        _signup(anon_client, "intruder@test.com")
        resp = anon_client.get(f"/projects/get/{project_id}")
        assert resp.status_code == 404

    def test_recent_is_owner_scoped(self, client, anon_client):
        _upload(client)
        assert len(client.get("/projects/recent").json()) >= 1
        _signup(anon_client, "freshuser@test.com")
        assert anon_client.get("/projects/recent").json() == []
