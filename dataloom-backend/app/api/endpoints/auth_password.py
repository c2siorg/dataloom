"""Password reset endpoints: forgot-password and reset-password."""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app import database, models
from app.config import get_settings
from app.services.auth_service import hash_password
from app.utils.email import send_reset_email
from app.utils.logging import get_logger

logger = get_logger(__name__)
router = APIRouter()

TOKEN_EXPIRY_HOURS = 1


def _hash_token(token: str) -> str:
    """SHA-256 hash a raw token for safe DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot-password")
async def forgot_password(
    email: str,
    db: Session = Depends(database.get_db),
):
    """Request a password reset email.

    Always returns the same response regardless of whether the email
    exists, to prevent user enumeration.
    """
    settings = get_settings()
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        # Invalidate any existing unused tokens for this user
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False,  # noqa: E712
        ).update({"used": True})

        raw_token = secrets.token_urlsafe(32)
        token_hash = _hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=TOKEN_EXPIRY_HOURS)

        reset_token = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(reset_token)
        db.commit()

        print("HERE")
        reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"
        send_reset_email(user.email, reset_url)
        logger.info("Password reset requested for user: %s", user.id)

    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    token: str,
    new_password: str,
    db: Session = Depends(database.get_db),
):
    """Reset a user's password using a valid reset token."""
    token_hash = _hash_token(token)

    reset_token = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token_hash == token_hash,
            models.PasswordResetToken.used == False,  # noqa: E712
        )
        .first()
    )

    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    if datetime.now(UTC) > reset_token.expires_at.replace(tzinfo=UTC):
        reset_token.used = True
        db.commit()
        raise HTTPException(status_code=400, detail="Reset token has expired")

    if len(new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = db.query(models.User).filter(models.User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(new_password)
    reset_token.used = True
    db.commit()

    logger.info("Password reset successful for user: %s", user.id)
    return {"message": "Password reset successful"}
