"""File storage and management service for dataset uploads."""

import os
import shutil
import tempfile
import uuid
from collections.abc import Iterable
from pathlib import Path

from app.config import get_settings
from app.utils import df_cache
from app.utils.file_formats import supported_extensions
from app.utils.logging import get_logger
from app.utils.security import format_size_limit, resolve_upload_path, sanitize_filename

logger = get_logger(__name__)

_CHUNK_SIZE = 65_536  # 64 KB


def _copy_path_for(original_path: Path) -> Path:
    """Derive the working-copy path for an original file, preserving its extension."""
    return original_path.with_name(f"{original_path.stem}_copy{original_path.suffix}")


def _validated_write(file) -> Path:
    """Validate an upload and write it to a sanitized path in the upload dir.

    Validates the file extension against the supported-format registry, then
    streams the upload in 64 KB chunks to a ``.part`` sibling of the target,
    counting bytes as it goes, so the upload is read exactly once. The
    ``.part`` file is renamed onto the target only when the whole upload is
    within ``max_upload_size_bytes``, and removed on any failure, so the
    target path never holds a partial file.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Path the file was written to.

    Raises:
        ValueError: If the file format is unsupported or it exceeds
            ``settings.max_upload_size_bytes``.
    """
    settings = get_settings()
    max_bytes = settings.max_upload_size_bytes

    ext = Path(file.filename).suffix.lower()
    if ext not in supported_extensions():
        raise ValueError(f"Unsupported file format '{ext}'. Supported: {supported_extensions()}")

    target_path = resolve_upload_path(sanitize_filename(file.filename))
    part_path = target_path.with_name(target_path.name + ".part")

    try:
        written = 0
        with open(part_path, "wb") as out:
            while chunk := file.file.read(_CHUNK_SIZE):
                written += len(chunk)
                if written > max_bytes:
                    size_mb = written / (1024 * 1024)
                    limit_str = format_size_limit(max_bytes)
                    raise ValueError(f"File size {size_mb:.1f}MB exceeds maximum allowed size of {limit_str}")
                out.write(chunk)
        os.replace(part_path, target_path)
    except BaseException:
        part_path.unlink(missing_ok=True)
        raise

    return target_path


def store_added_file(file) -> Path:
    """Store a file added to an existing project's inventory.

    Same validation and sanitized-name storage as ``store_upload``, but writes
    a single immutable file: inventory files are only ever read (append and
    replay), so no ``_copy`` working twin is created.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Path to the stored file.

    Raises:
        ValueError: If the file format is unsupported or it exceeds
            ``settings.max_upload_size_bytes``.
    """
    stored_path = _validated_write(file)
    logger.info("Stored added file: %s", stored_path)
    return stored_path


def store_upload(file) -> tuple[Path, Path]:
    """Store an uploaded file and create a working copy in the same format.

    The working copy keeps the native extension, so revert/undo can re-read
    the original in its own format. Validation and sanitized-name storage are
    shared with ``store_added_file`` via ``_validated_write``.

    Args:
        file: The FastAPI UploadFile object.

    Returns:
        Tuple of (original_path, copy_path).

    Raises:
        ValueError: If the file format is unsupported or it exceeds
            ``settings.max_upload_size_bytes``.
    """
    original_path = _validated_write(file)

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

    Invalidates both paths in the DataFrame cache; the files are gone either
    way, but this keeps memory from holding entries for deleted projects.

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
        finally:
            df_cache.invalidate(path)


# --- Undo snapshots ---
#
# A snapshot is a byte copy of a project's working copy, taken so undo and redo
# can put the file back exactly as it was instead of rebuilding it. Byte copies
# are exact and format-agnostic: they never re-serialize a DataFrame, so they
# cannot drift from what the user last saw. They are copies rather than hard
# links because the format writers truncate the working copy in place, which
# would rewrite a linked snapshot too.


def _snapshot_dir(project_id: uuid.UUID) -> Path:
    return resolve_upload_path(f"snapshots/{project_id}")


def take_snapshot(project_id: uuid.UUID, working_path: str) -> str:
    """Copy a project's working copy into a new snapshot file.

    The snapshot lives under ``{upload_dir}/snapshots/{project_id}/`` and keeps
    the working copy's extension, so it parses in the same format. If the
    working copy's parsed frame is cached and current, the snapshot is
    registered against it, so reading the snapshot back never re-parses.

    Args:
        project_id: The project the working copy belongs to.
        working_path: Path to the project's working copy.

    Returns:
        Path to the new snapshot file.
    """
    snapshot_dir = _snapshot_dir(project_id)
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    snapshot_path = resolve_upload_path(f"snapshots/{project_id}/{uuid.uuid4().hex}{Path(working_path).suffix}")
    shutil.copyfile(working_path, snapshot_path)
    df_cache.alias(working_path, snapshot_path)
    return str(snapshot_path)


def restore_snapshot(snapshot_path: str, working_path: str) -> None:
    """Replace the working copy with a snapshot's bytes, atomically.

    The bytes go to a temp file beside the working copy first, then
    ``os.replace`` swaps it in, so a failure at any point leaves either the old
    working copy or the complete snapshot, never a truncated mix. On Windows
    ``os.replace`` fails while another process holds the file open; that
    surfaces as an ``OSError`` with the working copy untouched.

    Args:
        snapshot_path: The snapshot to restore.
        working_path: The project's working copy to overwrite.

    Raises:
        OSError: If the copy or the swap fails; the working copy is unchanged.
    """
    working = Path(working_path)
    with tempfile.NamedTemporaryFile(
        dir=working.parent, prefix=".restore-", suffix=working.suffix, delete=False
    ) as tmp:
        tmp_path = Path(tmp.name)
    try:
        shutil.copyfile(snapshot_path, tmp_path)
        if working.exists():
            # Temp files are created 0600; keep the working copy's own mode.
            shutil.copymode(working, tmp_path)
        os.replace(tmp_path, working)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise
    finally:
        df_cache.invalidate(working)
    df_cache.alias(snapshot_path, working)


def snapshot_exists(snapshot_path: str | None) -> bool:
    """Whether a recorded snapshot is still on disk."""
    return snapshot_path is not None and Path(snapshot_path).is_file()


def unlink_snapshots(snapshot_paths: Iterable[str]) -> None:
    """Delete snapshot files that no committed row references any more.

    Callers pass paths only after the commit that dropped them succeeded, so a
    crash can orphan a file but never delete one still in use. Failures are
    logged rather than raised: the change they follow has already committed.

    Args:
        snapshot_paths: Snapshot files to delete.
    """
    for snapshot_path in snapshot_paths:
        df_cache.invalidate(snapshot_path)
        try:
            Path(snapshot_path).unlink()
        except FileNotFoundError:
            logger.warning("Snapshot already missing: %s", snapshot_path)
        except OSError:
            logger.exception("Failed to delete snapshot: %s", snapshot_path)


def delete_project_snapshots(project_id: uuid.UUID) -> None:
    """Delete a project's whole snapshot directory, for project and account deletion.

    Args:
        project_id: The deleted project.
    """
    snapshot_dir = _snapshot_dir(project_id)
    if not snapshot_dir.is_dir():
        return
    for snapshot_path in snapshot_dir.iterdir():
        df_cache.invalidate(snapshot_path)
    try:
        shutil.rmtree(snapshot_dir)
        logger.info("Deleted snapshots: %s", snapshot_dir)
    except OSError:
        logger.exception("Failed to delete snapshot directory: %s", snapshot_dir)
