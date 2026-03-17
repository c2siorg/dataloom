import shutil
from pathlib import Path

from app.utils.logging import get_logger
from app.utils.security import resolve_upload_path, sanitize_filename

logger = get_logger(__name__)

SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".json", ".parquet", ".tsv"}


def store_upload(file) -> tuple[Path, Path]:
    safe_name = sanitize_filename(file.filename)
    original_path = resolve_upload_path(safe_name)

    with open(original_path, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    copy_name = _to_csv_name(str(original_path))
    copy_path = Path(copy_name)

    _convert_to_csv(original_path, copy_path)

    logger.info("Stored upload: original=%s, copy=%s", original_path, copy_path)
    return original_path, copy_path


def _to_csv_name(path_str: str) -> str:
    p = Path(path_str)
    return str(p.with_suffix("")).replace(p.stem, p.stem + "_copy") + ".csv"


def _convert_to_csv(source: Path, dest: Path) -> None:
    import pandas as pd

    ext = source.suffix.lower()
    if ext == ".csv":
        shutil.copy2(source, dest)
    elif ext == ".tsv":
        df = pd.read_csv(source, sep="\t")
        df.to_csv(dest, index=False)
    elif ext == ".xlsx":
        df = pd.read_excel(source)
        df.to_csv(dest, index=False)
    elif ext == ".json":
        df = pd.read_json(source)
        df.to_csv(dest, index=False)
    elif ext == ".parquet":
        df = pd.read_parquet(source)
        df.to_csv(dest, index=False)
    else:
        raise ValueError(f"Unsupported file format: {ext}")


def get_original_path(copy_path: str) -> Path:
    return Path(copy_path.replace("_copy.csv", ".csv"))
