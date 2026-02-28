"""Centralized configuration module for the DataLoom backend.

Reads settings from environment variables and .env file using Pydantic BaseSettings.
Provides a cached get_settings() function for efficient access throughout the application.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file.

    Attributes:
        database_url: PostgreSQL connection string.
        upload_dir: Directory for storing uploaded CSV files.
        max_upload_size_bytes: Maximum allowed upload file size in bytes.
        allowed_extensions: List of permitted file extensions for upload.
        cors_origins: List of allowed CORS origin URLs.
        debug: Enable debug mode for verbose logging.
    """

    database_url: str
    upload_dir: str = "uploads"
    max_upload_size_bytes: int = 10_485_760  # 10 MB
    allowed_extensions: list[str] = [".csv"]
    cors_origins: list[str] = ["http://localhost:3200"]
    debug: bool = False

    model_config = {
        "env_file": ".env",
    }


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance.

    Uses lru_cache so the .env file is only read once per process lifetime.

    Returns:
        The application Settings object.
    """
    return Settings()
