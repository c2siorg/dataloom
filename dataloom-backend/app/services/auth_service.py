"""Authentication service: hashing, JWT config, user management."""

import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from fastapi_users.exceptions import InvalidPasswordException
from fastapi_users.password import PasswordHelper
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import get_async_session
from app.models import User
from app.utils.logging import get_logger

logger = get_logger(__name__)

# --- Hashing ---

password_hash = PasswordHash((Argon2Hasher(),))
password_helper = PasswordHelper(password_hash)


def validate_password_rules(password: str, email: str = "") -> None:
    """Validate password strength without imposing composition rules."""
    if len(password) < 8:
        raise InvalidPasswordException(reason="Password should be at least 8 characters long.")

    email_local_part = email.split("@", 1)[0].casefold()
    if len(email_local_part) >= 4 and email_local_part in password.casefold():
        raise InvalidPasswordException(reason="Password should not contain your email address.")


# --- JWT / transport ---

_settings = get_settings()
cookie_transport = CookieTransport(
    cookie_name="dataloomauth",
    cookie_max_age=_settings.auth_token_lifetime_seconds,
    cookie_secure=_settings.auth_cookie_secure and not _settings.testing,
    cookie_httponly=True,
    cookie_samesite="strict",
)
del _settings


def get_jwt_strategy() -> JWTStrategy:
    """Return the JWT strategy used for browser sessions."""
    current_settings = get_settings()
    return JWTStrategy(
        secret=current_settings.auth_secret.get_secret_value(),
        lifetime_seconds=current_settings.auth_token_lifetime_seconds,
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

# --- User repository ---

async_session_dependency = Depends(get_async_session)


async def get_user_db(
    session: AsyncSession = async_session_dependency,
) -> AsyncGenerator[SQLAlchemyUserDatabase, None]:
    """Yield the FastAPI Users database adapter for the current async session."""
    yield SQLAlchemyUserDatabase(session, User)


# --- User manager ---

user_db_dependency = Depends(get_user_db)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    """User lifecycle hooks and password validation."""

    # TODO: Wire up password reset and email verification flows end-to-end.

    @property
    def reset_password_token_secret(self) -> str:
        return get_settings().auth_secret.get_secret_value()

    @property
    def verification_token_secret(self) -> str:
        return get_settings().auth_secret.get_secret_value()

    async def validate_password(self, password: str, user: Any) -> None:
        """Enforce the application password rules."""
        validate_password_rules(password, getattr(user, "email", ""))

    async def on_after_register(self, user: User, request: Request | None = None) -> None:
        """Log successful registrations."""
        logger.info("User registered: id=%s email=%s", user.id, user.email)


async def get_user_manager(
    user_db: SQLAlchemyUserDatabase = user_db_dependency,
):
    """Yield the FastAPI Users manager instance."""
    yield UserManager(user_db, password_helper)


fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

# --- Dependency shortcut ---

current_active_user = fastapi_users.current_user(active=True)
