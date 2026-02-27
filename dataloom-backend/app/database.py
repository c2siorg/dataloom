from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

settings = get_settings()

# SQLite requires check_same_thread=False for use with FastAPI/threading
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
