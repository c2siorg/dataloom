from collections.abc import Generator

from sqlmodel import Session, create_engine

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
