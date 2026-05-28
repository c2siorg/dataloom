"""Tests for forgot-password and reset-password endpoints."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from app import models
from app.api.endpoints.auth_password import _hash_token
from app.services.auth_service import create_user, verify_password


class TestPasswordReset:
    def test_forgot_password_unknown_email_returns_success(self, client):
        """Should return success even for unknown emails to prevent enumeration."""
        with patch("app.api.endpoints.auth_password.send_reset_email"):
            response = client.post("/auth/forgot-password", params={"email": "unknown@example.com"})
        assert response.status_code == 200
        assert "reset link" in response.json()["message"]

    def test_forgot_password_known_email_creates_token(self, client, db):
        """Should create a reset token for a known email."""
        create_user(db, "test@example.com", "password123")

        with patch("app.api.endpoints.auth_password.send_reset_email") as mock_send:
            response = client.post("/auth/forgot-password", params={"email": "test@example.com"})

        assert response.status_code == 200
        mock_send.assert_called_once()
        token = db.query(models.PasswordResetToken).first()
        assert token is not None
        assert token.used is False

    def test_reset_password_valid_token(self, client, db):
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

        response = client.post(
            "/auth/reset-password",
            params={"token": raw_token, "new_password": "newpassword123"},
        )
        assert response.status_code == 200

        db.refresh(user)
        assert verify_password("newpassword123", user.password_hash)

        db.refresh(reset_token)
        assert reset_token.used is True

    def test_reset_password_invalid_token(self, client):
        """Should reject invalid tokens."""
        response = client.post(
            "/auth/reset-password",
            params={"token": "invalidtoken", "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_expired_token(self, client, db):
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

        response = client.post(
            "/auth/reset-password",
            params={"token": raw_token, "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_used_token(self, client, db):
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

        response = client.post(
            "/auth/reset-password",
            params={"token": raw_token, "new_password": "newpassword123"},
        )
        assert response.status_code == 400

    def test_reset_password_too_short(self, client, db):
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

        response = client.post(
            "/auth/reset-password",
            params={"token": raw_token, "new_password": "short"},
        )
        assert response.status_code == 422
