"""Centralized configuration module for the DataLoom backend.

Reads settings from environment variables and .env file using Pydantic BaseSettings.
Provides a cached get_settings() function for efficient access throughout the application.
"""

from functools import lru_cache

from pydantic import field_validator
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
    cors_origins: list[str] = ["http://localhost:3200", "http://localhost:3201"]
    debug: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            if v.startswith("["):
                import json
                try:
                    return json.loads(v)
                except ValueError:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        if isinstance(v, list):
            return v
        return ["http://localhost:3200", "http://localhost:3201"]

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
