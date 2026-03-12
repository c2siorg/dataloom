"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.utils.logging import get_logger
from app.utils.pandas_helpers import read_datafile, save_csv_safe
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a CSV working copy.

    Saves the file with a sanitized name in its original format.
    Reads the file into a DataFrame using the format-aware reader,
    then saves a CSV working copy for the transformation pipeline.

    This ensures the transformation pipeline (which operates on CSV)
    works regardless of the original upload format.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).
    """
    safe_name = sanitize_filename(file.filename)
    original_path = resolve_upload_path(safe_name)

    # Save the original file in its native format
    with open(original_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    # Read the file using format-aware reader and save working copy as CSV
    df = read_datafile(original_path)
    ext = original_path.suffix.lower()
    copy_name = str(original_path).replace(ext, "_copy.csv")
    copy_path = Path(copy_name)
    save_csv_safe(df, copy_path)

    logger.info("Stored upload: original=%s (%s), copy=%s (csv)", original_path, ext, copy_path)
    return original_path, copy_path


def get_original_path(copy_path: str) -> Path:
    """Derive the original file path from a working copy path.

    Note: Since the working copy is always CSV but the original may be
    any supported format, this searches for the original file by trying
    all supported extensions.

    Args:
        copy_path: Path to the _copy.csv working file.

    Returns:
        Path to the original file.

    Raises:
        FileNotFoundError: If no original file is found.
    """
    base = copy_path.replace("_copy.csv", "")
    supported_extensions = [".csv", ".xlsx", ".json", ".parquet", ".tsv"]

    for ext in supported_extensions:
        candidate = Path(base + ext)
        if candidate.exists():
            return candidate

    # Fallback to the old behavior for backwards compatibility
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