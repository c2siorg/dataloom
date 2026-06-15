"""Tests for authentication: signup, signin, logout, protected routes, and password reset."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app import models
from app.services.auth_service import create_user, verify_password


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


class TestProfileManagement:
    def test_update_email_success(self, client, test_user):
        """Should update the authenticated user's email."""
        response = client.patch("/auth/me/email", json={"email": "updated@test.com"})

        assert response.status_code == 200
        body = response.json()
        assert body["email"] == "updated@test.com"
        assert body["id"] == str(test_user.id)

    def test_update_email_requires_auth(self, anon_client):
        """Should reject email updates without authentication."""
        response = anon_client.patch("/auth/me/email", json={"email": "updated@test.com"})

        assert response.status_code == 401

    def test_update_email_duplicate_returns_409(self, client, db):
        """Should reject email updates when another account already uses the email."""
        create_user(db, "existing@test.com", "password123")

        response = client.patch("/auth/me/email", json={"email": "existing@test.com"})

        assert response.status_code == 409

    def test_update_email_invalid_returns_422(self, client):
        """Should reject invalid email format."""
        response = client.patch("/auth/me/email", json={"email": "not-an-email"})

        assert response.status_code == 422

    def test_change_password_success(self, client, test_user, db):
        """Should change password when current password is valid."""
        response = client.patch(
            "/auth/me/password",
            json={
                "current_password": "testpassword",
                "new_password": "newpassword123",
            },
        )

        assert response.status_code == 200
        assert response.json()["message"] == "Password changed successfully"

        db.refresh(test_user)
        assert verify_password("newpassword123", test_user.password_hash)

    def test_change_password_requires_auth(self, anon_client):
        """Should reject password changes without authentication."""
        response = anon_client.patch(
            "/auth/me/password",
            json={
                "current_password": "testpassword",
                "new_password": "newpassword123",
            },
        )

        assert response.status_code == 401

    def test_change_password_wrong_current_password_returns_400(self, client):
        """Should reject password change when current password is incorrect."""
        response = client.patch(
            "/auth/me/password",
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword123",
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Current password is incorrect"

    def test_change_password_too_short_returns_422(self, client):
        """Should reject new passwords shorter than 8 characters."""
        response = client.patch(
            "/auth/me/password",
            json={
                "current_password": "testpassword",
                "new_password": "short",
            },
        )

        assert response.status_code == 422

    def test_delete_account_success(self, client, test_user, db):
        response = client.request(
            "DELETE",
            "/auth/me",
            json={"password": "testpassword"},
        )

        assert response.status_code == 200
        assert response.json()["message"] == "Account deleted successfully"

        deleted_user = db.query(models.User).filter(models.User.id == test_user.id).first()
        assert deleted_user is None

    def test_delete_account_requires_auth(self, anon_client):
        response = anon_client.request(
            "DELETE",
            "/auth/me",
            json={"password": "testpassword"},
        )

        assert response.status_code == 401

    def test_delete_account_wrong_password_returns_400(self, client):
        response = client.request(
            "DELETE",
            "/auth/me",
            json={"password": "wrongpassword"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Incorrect password"


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


class TestPasswordReset:
    def test_forgot_password_unknown_email_returns_success(self, anon_client):
        """Should return success even for unknown emails to prevent enumeration."""
        with patch("app.services.auth_service.send_reset_email"):
            response = anon_client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
        assert response.status_code == 200
        assert "reset link" in response.json()["message"]

    def test_forgot_password_known_email_creates_token(self, anon_client, db):
        """Should create a reset token for a known email."""
        create_user(db, "test@example.com", "password123")

        with patch("app.services.auth_service.send_reset_email") as mock_send:
            response = anon_client.post("/auth/forgot-password", json={"email": "test@example.com"})

        assert response.status_code == 200
        mock_send.assert_called_once()
        token = db.query(models.PasswordResetToken).first()
        assert token is not None
        assert token.used is False

    def test_reset_password_valid_token(self, anon_client, db):
        """Should reset password with a valid token."""
        user = create_user(db, "reset@example.com", "oldpassword123")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        response = anon_client.post("/auth/reset-password", json={"token": raw_token, "new_password": "newpassword123"})
        assert response.status_code == 200

        db.refresh(user)
        assert verify_password("newpassword123", user.password_hash)

        db.refresh(reset_token)
        assert reset_token.used is True

    def test_reset_password_invalid_token(self, anon_client):
        """Should reject invalid tokens."""
        response = anon_client.post(
            "/auth/reset-password",
            json={"token": "invalidtoken", "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_expired_token(self, anon_client, db):
        """Should reject expired tokens."""
        user = create_user(db, "expired@example.com", "oldpassword123")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        response = anon_client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_used_token(self, anon_client, db):
        """Should reject already used tokens."""
        user = create_user(db, "used@example.com", "oldpassword123")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
            used=True,
        )
        db.add(reset_token)
        db.commit()

        response = anon_client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_too_short(self, anon_client, db):
        """Should reject passwords shorter than 8 characters."""
        user = create_user(db, "short@example.com", "oldpassword123")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        db.add(reset_token)
        db.commit()

        response = anon_client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "short"},
        )
        assert response.status_code == 422
