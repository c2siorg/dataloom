"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.config import get_settings
from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a working copy.

    Validates the file extension (must be .csv) and enforces the configured
    ``max_upload_size_bytes`` limit via chunked streaming before writing
    anything to disk.  The file pointer is reset to 0 after validation so
    ``shutil.copyfileobj`` writes a complete file.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).

    Raises:
        ValueError: If the file is not a CSV or exceeds
            ``settings.max_upload_size_bytes``.
    """
    settings = get_settings()
    max_bytes = settings.max_upload_size_bytes

    # 1. Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext != ".csv":
        raise ValueError(f"Only CSV files are supported. Got: {ext}")

    # 2. Validate file size via chunked streaming (avoids full memory read)
    _CHUNK = 65_536  # 64 KB
    cumulative = 0
    while chunk := file.file.read(_CHUNK):
        cumulative += len(chunk)
        if cumulative > max_bytes:
            size_mb = cumulative / (1024 * 1024)
            limit_mb = max_bytes / (1024 * 1024)
            limit_str = f"{int(limit_mb)}MB" if limit_mb == int(limit_mb) else f"{limit_mb:.1f}MB"
            raise ValueError(f"File size {size_mb:.1f}MB exceeds maximum allowed size of {limit_str}")

    # 3. Reset pointer so shutil.copyfileobj can read from the beginning
    file.file.seek(0)

    safe_name = sanitize_filename(file.filename)
    original_path = resolve_upload_path(safe_name)

    with open(original_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    copy_path = Path(str(original_path).replace(".csv", "_copy.csv"))
    shutil.copy2(original_path, copy_path)

    logger.info("Stored upload: original=%s, copy=%s", original_path, copy_path)
    return original_path, copy_path


def get_original_path(copy_path: str) -> Path:
    """Derive the original file path from a working copy path.

    Args:
        copy_path: Path to the _copy.csv working file.

    Returns:
        Path to the original CSV file.
    """
    return Path(copy_path.replace("_copy.csv", ".csv"))


def delete_project_files(copy_path: str) -> None:
    """Delete both the working copy and original file for a project.

    Args:
        copy_path: Path to the _copy.csv working file.
    """
    original_path = get_original_path(copy_path)

    for path in [Path(copy_path), original_path]:
        try:
            path.unlink()
            logger.info("Deleted file: %s", path)
        except FileNotFoundError:
            logger.warning("File already missing: %s", path)
