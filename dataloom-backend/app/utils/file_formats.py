"""File-format registry for multi-format dataset I/O.

Each supported upload format is described by a :class:`FileFormat` entry that
knows how to read it into a DataFrame, write a DataFrame back out, and what
media type to serve it with. The rest of the application stays format-agnostic:
transforms operate purely on DataFrames, and the working copy is kept in the
same native format it was uploaded in.

To add a new format, register one :class:`FileFormat` below — no changes are
needed in the transform, save, or revert layers.
"""

import json
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class TableWriteOptions:
    """Optional settings for writing a DataFrame to disk."""

    delimiter: str | None = None
    include_header: bool = True
    encoding: str | None = None

    def has_options(self) -> bool:
        return self.delimiter is not None or self.encoding is not None or not self.include_header


@dataclass(frozen=True)
class FileFormat:
    """Describes how to read, write, and serve a single dataset file format.

    Attributes:
        extension: The lowercased file extension including the leading dot.
        read: Callable that loads a path into a DataFrame.
        write: Callable that writes a DataFrame to a path.
        media_type: HTTP content type used when serving the file for download.
    """

    extension: str
    read: Callable[[Path], pd.DataFrame]
    write: Callable[[pd.DataFrame, Path, TableWriteOptions | None], None]
    media_type: str


# --- CSV / TSV ------------------------------------------------------------


_DELIMITER_ALIASES = {"comma": ",", "tab": "\t", "semicolon": ";", "pipe": "|"}
_ENCODINGS = {"utf-8", "latin-1", "ascii", "utf-16"}


def _resolve_delimited_options(options: TableWriteOptions | None, default_sep: str) -> dict:
    options = options or TableWriteOptions()

    sep = default_sep
    if options.delimiter is not None:
        sep = _DELIMITER_ALIASES.get(options.delimiter.lower())
        if sep is None:
            raise ValueError(f"Unsupported delimiter '{options.delimiter}'. Supported: {sorted(_DELIMITER_ALIASES)}")

    encoding = options.encoding or "utf-8"
    if encoding.lower() not in _ENCODINGS:
        raise ValueError(f"Unsupported encoding '{encoding}'. Supported: {sorted(_ENCODINGS)}")

    return {
        "sep": sep,
        "header": options.include_header,
        "index": False,
        "encoding": encoding,
        "lineterminator": "\n",
    }


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path)


def _write_csv(df: pd.DataFrame, path: Path, options: TableWriteOptions | None = None) -> None:
    df.to_csv(path, **_resolve_delimited_options(options, default_sep=","))


def _read_tsv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep="\t")


def _write_tsv(df: pd.DataFrame, path: Path, options: TableWriteOptions | None = None) -> None:
    df.to_csv(path, **_resolve_delimited_options(options, default_sep="\t"))


# --- JSON (one level of nesting) ------------------------------------------


def _scalarize(value):
    """Coerce a JSON value into a cell value.

    Arrays are stored as their JSON-string representation; scalars pass through
    unchanged. Nested objects are handled by the caller, which flattens exactly
    one level and rejects anything deeper.
    """
    if isinstance(value, list):
        return json.dumps(value)
    return value


def _read_json(path: Path) -> pd.DataFrame:
    """Read a JSON file into a DataFrame, flattening at most one level.

    Accepts either a single object or an array of objects. A nested object is
    flattened into ``parent.child`` columns; arrays become JSON strings. Nesting
    deeper than one level is rejected so the failure surfaces at upload time.

    Raises:
        ValueError: If the JSON is not object-shaped or nests more than one level.
    """
    with open(path) as f:
        data = json.load(f)

    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        raise ValueError("JSON must be an object or an array of objects.")

    records: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            raise ValueError("Each JSON record must be an object.")
        flat: dict = {}
        for key, value in item.items():
            if isinstance(value, dict):
                for subkey, subvalue in value.items():
                    if isinstance(subvalue, dict):
                        raise ValueError(
                            f"Nested object too deep at '{key}.{subkey}'; only one level of nesting is supported."
                        )
                    flat[f"{key}.{subkey}"] = _scalarize(subvalue)
            else:
                flat[key] = _scalarize(value)
        records.append(flat)

    return pd.DataFrame(records)


def _write_json(df: pd.DataFrame, path: Path, _) -> None:
def _write_json(df: pd.DataFrame, path: Path, *_ignored) -> None:
    df.to_json(path, orient="records", indent=2)


# --- XLSX -----------------------------------------------------------------


def _read_xlsx(path: Path) -> pd.DataFrame:
    # Default to the first sheet; multi-sheet selection can be added later.
    return pd.read_excel(path)


def _write_xlsx(df: pd.DataFrame, path: Path, *_ignored) -> None:
    df.to_excel(path, index=False)


# --- Parquet --------------------------------------------------------------


def _read_parquet(path: Path) -> pd.DataFrame:
    return pd.read_parquet(path)


def _write_parquet(df: pd.DataFrame, path: Path, *_ignored) -> None:
    try:
        df.to_parquet(path, index=False)
    except (ValueError, TypeError):
        # pyarrow rejects mixed-type object columns (e.g. a column holding both
        # ints and strings after cell edits). Stringify object columns and retry
        # so a parquet write/export never crashes on messy data.
        coerced = df.copy()
        obj_cols = coerced.select_dtypes(include="object").columns
        coerced[obj_cols] = coerced[obj_cols].astype(str)
        coerced.to_parquet(path, index=False)


_FORMATS: dict[str, FileFormat] = {
    fmt.extension: fmt
    for fmt in [
        FileFormat(".csv", _read_csv, _write_csv, "text/csv"),
        FileFormat(".tsv", _read_tsv, _write_tsv, "text/tab-separated-values"),
        FileFormat(".json", _read_json, _write_json, "application/json"),
        FileFormat(
            ".xlsx",
            _read_xlsx,
            _write_xlsx,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
        FileFormat(".parquet", _read_parquet, _write_parquet, "application/vnd.apache.parquet"),
    ]
}


def supported_extensions() -> list[str]:
    """Return the list of supported file extensions (with leading dots)."""
    return list(_FORMATS.keys())


def get_format_for_extension(ext: str) -> FileFormat:
    """Look up the :class:`FileFormat` for a bare extension (e.g. ``csv`` or ``.csv``).

    Args:
        ext: An extension, with or without the leading dot.

    Returns:
        The matching FileFormat.

    Raises:
        ValueError: If the extension is not supported.
    """
    ext = ext.lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    fmt = _FORMATS.get(ext)
    if fmt is None:
        raise ValueError(f"Unsupported file format '{ext}'. Supported: {supported_extensions()}")
    return fmt


def get_format(path) -> FileFormat:
    """Look up the :class:`FileFormat` for a path by its extension.

    Args:
        path: A filesystem path or string whose suffix identifies the format.

    Returns:
        The matching FileFormat.

    Raises:
        ValueError: If the extension is not supported.
    """
    return get_format_for_extension(Path(path).suffix)
