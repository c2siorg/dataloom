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
        jwt_secret: Secret key used to sign JWT auth tokens.
        jwt_algorithm: Algorithm used to sign JWT auth tokens.
        jwt_expiry_hours: Lifetime of an issued auth token in hours.
        cookie_secure: Whether the auth cookie is restricted to HTTPS.
        smtp_host: SMTP server hostname used for sending emails.
        smtp_port: Port used to connect to the SMTP server.
        smtp_username: Username/email used for SMTP authentication.
        smtp_password: Password or app-specific password for SMTP authentication.
        smtp_from_email: Default sender email address for outgoing emails.
    """

    database_url: str
    upload_dir: str = "uploads"
    max_upload_size_bytes: int = 10_485_760  # 10 MB
    allowed_extensions: list[str] = [".csv", ".tsv", ".json", ".xlsx", ".parquet"]
    cors_origins: list[str] = ["http://localhost:3200"]
    debug: bool = False
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24
    cookie_secure: bool = True
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    frontend_url: str = "http://localhost:3200"

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
