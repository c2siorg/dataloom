"""Compatibility module for existing database imports."""

from app.db.base import AuthBase
from app.db.session import async_engine, async_session_maker, engine, get_async_session, get_db

__all__ = [
    "AuthBase",
    "async_engine",
    "async_session_maker",
    "engine",
    "get_async_session",
    "get_db",
]
