"""Authentication service: password hashing, JWT tokens, and user operations."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlmodel import Session

from app import models
from app.config import get_settings
from app.utils.email import send_reset_email
from app.utils.logging import get_logger

logger = get_logger(__name__)

# bcrypt only considers the first 72 bytes of a password.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _hash_token(token: str) -> str:
    """SHA-256 hash a raw token for safe DB storage."""
    return hashlib.sha256(token.encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
    """Check a plaintext password against a bcrypt hash."""
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > MAX_PASSWORD_BYTES:
        return False
    return bcrypt.checkpw(password_bytes, password_hash.encode("utf-8"))


def create_access_token(user_id: uuid.UUID) -> str:
    """Create a signed JWT for the given user, expiring after the configured period."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> uuid.UUID | None:
    """Decode and validate a JWT, returning the user id, or None if invalid/expired."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def get_user_by_email(db: Session, email: str) -> models.User | None:
    """Fetch a user by email address."""
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> models.User | None:
    """Fetch a user by primary key."""
    return db.query(models.User).filter(models.User.id == user_id).first()


def create_user(db: Session, email: str, password: str) -> models.User:
    """Create and persist a new user with a hashed password."""
    user = models.User(email=email, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Created user: id=%s", user.id)
    return user


def authenticate_user(db: Session, email: str, password: str) -> models.User | None:
    """Return the user if the email/password pair is valid, else None."""
    user = get_user_by_email(db, email)
    if user is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_reset_token(db: Session, user: models.User, frontend_url: str) -> None:
    """Generate a reset token, store its hash, and send the reset email."""
    # Invalidate existing unused tokens
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used == False,  # noqa: E712
    ).update({"used": True})

    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(hours=1)

    reset_token = models.PasswordResetToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_token)
    db.commit()

    reset_url = f"{frontend_url}/reset-password?token={raw_token}"
    try:
        send_reset_email(user.email, reset_url)
        logger.info("Reset token created and email sent for user: %s", user.id)
    except Exception as e:
        logger.error("Failed to send reset email to %s: %s", user.email, e)
        # Do not re-raise — anti-enumeration requires consistent response


def validate_reset_token(db: Session, raw_token: str) -> models.PasswordResetToken:
    """Validate a reset token — raises ValueError if invalid/expired/used."""
    token_hash = _hash_token(raw_token)

    reset_token = (
        db.query(models.PasswordResetToken)
        .filter(
            models.PasswordResetToken.token_hash == token_hash,
            models.PasswordResetToken.used == False,  # noqa: E712
        )
        .first()
    )

    if not reset_token:
        raise ValueError("Invalid or expired reset token")

    if datetime.now(UTC) > reset_token.expires_at.replace(tzinfo=UTC):
        reset_token.used = True
        db.commit()
        raise ValueError("Reset token has expired")

    return reset_token


def reset_user_password(db: Session, reset_token: models.PasswordResetToken, new_password: str) -> None:
    """Update user password and mark token as used."""
    user = db.query(models.User).filter(models.User.id == reset_token.user_id).first()
    if not user:
        raise ValueError("User not found")

    user.password_hash = hash_password(new_password)
    reset_token.used = True
    db.commit()
    logger.info("Password reset successful for user: %s", user.id)
