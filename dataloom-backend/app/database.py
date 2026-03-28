"""Database configuration: engine, session, and metadata."""

from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

# Ensure models are registered
import app.models  # noqa: F401
from app.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
)

# Centralized metadata
metadata = SQLModel.metadata


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
