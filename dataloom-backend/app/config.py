"""Centralized configuration module for the DataLoom backend.

Reads settings from environment variables and .env file using Pydantic BaseSettings.
Provides a cached get_settings() function for efficient access throughout the application.
"""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file.

    Attributes:
        database_url: PostgreSQL connection string.
        auth_secret: Secret used to sign authentication tokens.
        auth_token_lifetime_seconds: Authentication token lifetime in seconds.
        auth_cookie_secure: Whether auth cookies require HTTPS.
        upload_dir: Directory for storing uploaded CSV files.
        max_upload_size_bytes: Maximum allowed upload file size in bytes.
        allowed_extensions: List of permitted file extensions for upload.
        cors_origins: List of allowed CORS origin URLs.
        debug: Enable debug mode for verbose logging.
        testing: Enable testing mode for local test runs.
    """

    database_url: str
    auth_secret: SecretStr
    auth_token_lifetime_seconds: int = 3600
    auth_cookie_secure: bool = False
    upload_dir: str = "uploads"
    max_upload_size_bytes: int = 10_485_760  # 10 MB
    allowed_extensions: list[str] = [".csv"]
    cors_origins: list[str] = ["http://localhost:3200"]
    debug: bool = False
    testing: bool = False

    model_config = {
        "env_file": ".env",
    }

    @property
    def async_database_url(self) -> str:
        """Return an async driver URL matching the configured database."""
        database_url = self.database_url

        if database_url.startswith("postgresql+asyncpg://") or database_url.startswith("sqlite+aiosqlite://"):
            return database_url

        replacements = {
            "postgresql+psycopg2://": "postgresql+asyncpg://",
            "postgresql+psycopg://": "postgresql+asyncpg://",
            "postgresql://": "postgresql+asyncpg://",
            "sqlite://": "sqlite+aiosqlite://",
        }

        for prefix, async_prefix in replacements.items():
            if database_url.startswith(prefix):
                return database_url.replace(prefix, async_prefix, 1)

        raise ValueError(f"Unsupported database URL for async auth session: {database_url}")


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Uses lru_cache so the .env file is only read once per process lifetime.

    Returns:
        The application Settings object.
    """
    return Settings()
