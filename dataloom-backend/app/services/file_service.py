"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)


from app.utils.pandas_helpers import read_file_safe, save_csv_safe

def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a canonical CSV working copy.

    Saves the file with a sanitized name, parses it to ensure it is valid,
    and converts it to standard .csv for both the original pristine file and
    the _copy.csv working file. This ensures downstream functions that expect
    CSV don't fail.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_csv_path, copy_csv_path).
    """
    safe_name = sanitize_filename(file.filename)
    raw_path = resolve_upload_path(safe_name)

    with open(raw_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    # Read the file using Pandas based on its original extension
    df = read_file_safe(raw_path)

    # Standardize our internal storage to always use .csv
    original_path = raw_path.with_suffix(".csv")
    copy_path = original_path.with_name(f"{original_path.stem}_copy.csv")
    
    save_csv_safe(df, original_path)
    save_csv_safe(df, copy_path)
    
    # Clean up the raw file if it was not originally a CSV
    if raw_path != original_path:
        raw_path.unlink()

    logger.info("Stored upload: original=%s, copy=%s", original_path, copy_path)
    return original_path, copy_path


def get_original_path(copy_path: str) -> Path:
    """Derive the original file path from a working copy path.

    Args:
        copy_path: Path to the working file (e.g. data_copy.csv).

    Returns:
        Path to the original file (e.g. data.csv).
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
