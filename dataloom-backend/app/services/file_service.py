"""File storage and management service for dataset uploads."""

import shutil
import io
from pathlib import Path
from typing import Iterator
import pandas as pd
from app import schemas
from app.utils.logging import get_logger
from app.utils.security import sanitize_filename, resolve_upload_path
from app.utils.pandas_helpers import read_csv_safe

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


def export_csv_with_format(file_path: str, params: schemas.ExportParameters) -> Iterator[str]:
    """Export CSV with custom formatting options.
    
    Args:
        file_path: Path to the CSV file to export.
        params: Export formatting parameters (delimiter, header, encoding).
        
    Yields:
        CSV content as string chunks for streaming response.
    """
    # Map delimiter enum to actual characters
    delimiter_map = {
        schemas.DelimiterType.comma: ',',
        schemas.DelimiterType.tab: '\t', 
        schemas.DelimiterType.semicolon: ';',
        schemas.DelimiterType.pipe: '|'
    }
    
    delimiter = delimiter_map[params.delimiter]
    df = read_csv_safe(Path(file_path))
    
    # Use StringIO to generate CSV in memory
    output = io.StringIO()
    df.to_csv(
        output,
        sep=delimiter,
        header=params.include_header,
        index=False,
        encoding=params.encoding
    )
    
    # Get the string content
    csv_content = output.getvalue()
    output.close()
    
    # Yield in chunks for streaming (optional, but follows streaming pattern)
    chunk_size = 8192
    for i in range(0, len(csv_content), chunk_size):
        yield csv_content[i:i + chunk_size]
    
    logger.info("Exported CSV: path=%s, delimiter=%s, header=%s, encoding=%s", 
                file_path, params.delimiter.value, params.include_header, params.encoding.value)
