"""Authentication service: password hashing, JWT tokens, and user operations."""

import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt
from sqlmodel import Session

from app import models
from app.config import get_settings
from app.utils.logging import get_logger

logger = get_logger(__name__)

# bcrypt only considers the first 72 bytes of a password.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


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
