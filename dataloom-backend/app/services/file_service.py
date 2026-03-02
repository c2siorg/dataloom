"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a working copy.

    Saves the file with a sanitized name and creates a _copy.csv for
    transformation operations, keeping the original pristine.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).
    """
    safe_name = sanitize_filename(file.filename)
    original_path = resolve_upload_path(safe_name)

    with open(original_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    copy_path = Path(str(original_path).replace('.csv', '_copy.csv'))
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
    return Path(copy_path.replace('_copy.csv', '.csv'))
