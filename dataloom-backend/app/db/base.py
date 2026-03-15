"""Shared ORM metadata definitions."""

from sqlalchemy.orm import DeclarativeBase
from sqlmodel import SQLModel


class AuthBase(DeclarativeBase):
    """Declarative base for auth tables sharing SQLModel metadata."""

    metadata = SQLModel.metadata
