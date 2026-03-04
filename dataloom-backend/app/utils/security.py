"""Security utilities for file upload validation, path safety, and query sanitization."""

import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import get_settings


def sanitize_filename(filename: str) -> str:
    """Sanitize an uploaded filename to prevent path traversal and naming conflicts.

    Strips directory components, replaces unsafe characters, and prepends a UUID
    to guarantee uniqueness.

    Args:
        filename: The original filename from the upload.

    Returns:
        A safe, unique filename string.
    """
    # Strip any directory path components (prevents ../../../etc/passwd)
    name = Path(filename).name
    # Replace any non-alphanumeric chars (except dots, hyphens, underscores) with underscores
    name = re.sub(r"[^\w.\-]", "_", name)
    # Prepend UUID for uniqueness
    return f"{uuid.uuid4().hex[:8]}_{name}"


def validate_upload_file(file: UploadFile) -> None:
    """Validate an uploaded file's extension and size.

    Args:
        file: The FastAPI UploadFile object.

    Raises:
        HTTPException: If the file extension is not allowed or the file is too large.
    """
    settings = get_settings()

    # Check file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {settings.allowed_extensions}"
        )


def resolve_upload_path(filename: str) -> Path:
    """Resolve a filename to a safe path within the upload directory.

    Defense-in-depth: after constructing the path, verifies the resolved
    absolute path doesn't escape the upload directory.

    Args:
        filename: The sanitized filename.

    Returns:
        The resolved Path within the upload directory.

    Raises:
        HTTPException: If the resolved path escapes the upload directory.
    """
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()

    # Ensure upload directory exists
    upload_dir.mkdir(parents=True, exist_ok=True)

    target = (upload_dir / filename).resolve()

    # Defense-in-depth: verify resolved path is inside upload_dir
    if not str(target).startswith(str(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")

    return target


# Patterns that could be used for code injection via df.query()
_DANGEROUS_PATTERNS = [
    r"__import__",
    r"__builtins__",
    r"__class__",
    r"__subclasses__",
    r"__globals__",
    r"\bexec\b",
    r"\bos\b\s*\.",
    r"\bsys\b\s*\.",
    r"\blambda\b",
    r"\bopen\b\s*\(",
    r"\bcompile\b\s*\(",
    r"__\w+__",  # Catch-all for dunder attributes
]


def validate_query_string(query: str) -> str:
    """Validate a pandas query string against known injection patterns.

    Blocks dangerous Python constructs that could be exploited through
    pandas df.query(), which internally uses expression evaluation.

    Args:
        query: The user-provided query string.

    Returns:
        The validated query string (unchanged if safe).

    Raises:
        HTTPException: If a dangerous pattern is detected.
    """
    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Query contains potentially dangerous expressions")
    return query
