"""File storage and management service for dataset uploads."""

import shutil
from pathlib import Path

from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)

SUPPORTED_FORMATS = {".csv", ".xlsx", ".xls", ".json", ".parquet", ".tsv"}


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a working copy.

    Saves the file with a sanitized name and creates a working copy
    (suffixed with _copy + original extension) for transformation
    operations, keeping the original pristine.

    Supports: CSV, Excel (.xlsx/.xls), JSON, Parquet, TSV.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).

    Raises:
        ValueError: If the file extension is not supported.
    """
    safe_name = sanitize_filename(file.filename)
    suffix = Path(safe_name).suffix.lower()

    if suffix not in SUPPORTED_FORMATS:
        raise ValueError(
            f"Unsupported file format '{suffix}'. Supported formats: {', '.join(sorted(SUPPORTED_FORMATS))}"
        )

    original_path = resolve_upload_path(safe_name)

    with open(original_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    # Build copy path by inserting _copy before the extension
    # e.g. data.xlsx -> data_copy.xlsx  (avoids .replace() string bugs)
    stem = original_path.stem
    copy_path = original_path.with_name(f"{stem}_copy{suffix}")
    shutil.copy2(original_path, copy_path)

    logger.info("Stored upload: original=%s, copy=%s", original_path, copy_path)
    return original_path, copy_path


def get_original_path(copy_path: str | Path) -> Path:
    """Derive the original file path from a working copy path.

    Args:
        copy_path: Path to the working copy file (str or Path).

    Returns:
        Path to the original file.
    """
    copy_path = Path(copy_path)
    suffix = copy_path.suffix
    # Remove the _copy suffix from the stem
    stem = copy_path.stem
    if stem.endswith("_copy"):
        original_stem = stem[: -len("_copy")]
    else:
        # Fallback: return as-is to avoid silent data loss
        logger.warning("copy_path does not end with _copy: %s", copy_path)
        original_stem = stem
    return copy_path.with_name(f"{original_stem}{suffix}")


def delete_project_files(copy_path: str | Path) -> None:
    """Delete both the working copy and original file for a project.

    Args:
        copy_path: Path to the working copy file.
    """
    original_path = get_original_path(copy_path)

    for path in [Path(copy_path), original_path]:
        try:
            path.unlink()
            logger.info("Deleted file: %s", path)
        except FileNotFoundError:
            logger.warning("File already missing: %s", path)
