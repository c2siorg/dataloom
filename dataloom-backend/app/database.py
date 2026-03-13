import sys
from collections.abc import Generator

from sqlalchemy.exc import OperationalError
from sqlmodel import Session, create_engine, text

from app.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)


def verify_database_connection():
    """Attempt to connect to the database. If it fails, print a clean error and exit."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("✅ Successfully connected to the database!")
    except OperationalError as e:
        print("❌ FATAL ERROR: Could not connect to the Database!")
        print("❌ Please check if your database is running and the URL in your .env file is correct.")
        print(f"❌ Details: {e.orig}")
        sys.exit(1)


def get_db() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
