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
    name = Path(filename).name
    name = re.sub(r"[^\w.\-]", "_", name)
    return f"{uuid.uuid4().hex[:8]}_{name}"


async def validate_upload_file(file: UploadFile) -> None:
    """Validate an uploaded file extension and size.

    Args:
        file: The FastAPI UploadFile object.

    Raises:
        HTTPException: If the file extension is not allowed or the file is too large.
    """
    settings = get_settings()

    ext = Path(file.filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {settings.allowed_extensions}"
        )

    if file.size is not None:
        if file.size > settings.max_upload_size_bytes:
            max_size_mb = settings.max_upload_size_bytes / (1024 * 1024)
            mb_str = f"{int(max_size_mb)}MB" if max_size_mb == int(max_size_mb) else f"{max_size_mb:.1f}MB"
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds the maximum allowed size of {mb_str}.",
            )
    else:
        await file.seek(0)
        file_size = 0
        while chunk := await file.read(65_536):
            file_size += len(chunk)
            if file_size > settings.max_upload_size_bytes:
                max_size_mb = settings.max_upload_size_bytes / (1024 * 1024)
                mb_str = f"{int(max_size_mb)}MB" if max_size_mb == int(max_size_mb) else f"{max_size_mb:.1f}MB"
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds the maximum allowed size of {mb_str}.",
                )
        await file.seek(0)


def resolve_upload_path(filename: str) -> Path:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    target = (upload_dir / filename).resolve()
    if not str(target).startswith(str(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return target


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
    r"__\w+__",
]


def validate_query_string(query: str) -> str:
    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Query contains potentially dangerous expressions")
    return query
