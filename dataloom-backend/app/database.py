from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def init_sqlite_schema() -> None:
    """Create tables from SQLModel metadata for SQLite environments.

    E2E and unit tests often use SQLite without running Alembic migrations.
    Importing models ensures metadata is fully registered before create_all.
    """

    import app.models  # noqa: F401

    SQLModel.metadata.create_all(engine)
