"""Shared ORM metadata definitions."""

from sqlalchemy.orm import DeclarativeBase
from sqlmodel import SQLModel


class AuthBase(DeclarativeBase):
    """Declarative base for auth tables sharing SQLModel metadata."""

    # Reuse SQLModel's metadata so Alembic detects auth tables
    # alongside SQLModel tables in a single autogenerate pass.
    metadata = SQLModel.metadata
