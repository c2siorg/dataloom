"""Database session factories and dependencies."""

from collections.abc import AsyncGenerator, Generator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlmodel import Session, create_engine

from app.config import get_settings

settings = get_settings()


def _sqlite_connect_args(url: str) -> dict[str, bool]:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    return {}


engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=_sqlite_connect_args(settings.database_url),
)

async_engine = create_async_engine(
    settings.async_database_url,
    pool_pre_ping=True,
    connect_args=_sqlite_connect_args(settings.async_database_url),
)
async_session_maker = async_sessionmaker(async_engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a synchronous SQLModel session."""
    with Session(engine) as session:
        yield session


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session for auth operations."""
    async with async_session_maker() as session:
        yield session
