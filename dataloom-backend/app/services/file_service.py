"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.config import get_settings
from app.utils.file_formats import supported_extensions
from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)


def _copy_path_for(original_path: Path) -> Path:
    """Derive the working-copy path for an original file, preserving its extension."""
    return original_path.with_name(f"{original_path.stem}_copy{original_path.suffix}")


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a working copy in the same format.

    Validates the file extension against the supported-format registry and
    enforces the configured ``max_upload_size_bytes`` limit via chunked
    streaming before writing anything to disk. The working copy keeps the
    native extension, so revert/undo can re-read the original in its own format.
    The file pointer is reset to 0 after validation so ``shutil.copyfileobj``
    writes a complete file.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).

    Raises:
        ValueError: If the file format is unsupported or it exceeds
            ``settings.max_upload_size_bytes``.
    """
    settings = get_settings()
    max_bytes = settings.max_upload_size_bytes

    # 1. Validate file extension
    ext = Path(file.filename).suffix.lower()
    if ext not in supported_extensions():
        raise ValueError(f"Unsupported file format '{ext}'. Supported: {supported_extensions()}")

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

    copy_path = _copy_path_for(original_path)
    shutil.copy2(original_path, copy_path)

    logger.info("Stored upload: original=%s, copy=%s", original_path, copy_path)
    return original_path, copy_path


def get_original_path(copy_path: str) -> Path:
    """Derive the original file path from a working copy path.

    Strips the ``_copy`` marker while preserving the native extension, so it
    works for any supported format (``data_copy.xlsx`` -> ``data.xlsx``).

    Args:
        copy_path: Path to the ``_copy`` working file.

    Returns:
        Path to the original file.
    """
    p = Path(copy_path)
    return p.with_name(f"{p.stem.removesuffix('_copy')}{p.suffix}")


def delete_project_files(copy_path: str) -> None:
    """Delete both the working copy and original file for a project.

    Args:
        copy_path: Path to the ``_copy`` working file.
    """
    original_path = get_original_path(copy_path)

    for path in [Path(copy_path), original_path]:
        try:
            path.unlink()
            logger.info("Deleted file: %s", path)
        except FileNotFoundError:
            logger.warning("File already missing: %s", path)
