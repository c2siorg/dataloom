"""Pandas utility functions for safe multi-format I/O and response building."""

import re
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import HTTPException

from app.utils.file_formats import TableWriteOptions, get_format


def read_table_safe(path: Path) -> pd.DataFrame:
    """Read a dataset file safely, dispatching on its format, with error handling.

    The format is resolved from the file extension via the format registry, so
    CSV/TSV/JSON/XLSX/Parquet all flow through this single helper.

    Datetime-like string columns are inferred immediately after reading so all
    downstream consumers, including profiling and response building, receive
    consistent dtypes.

    Args:
        path: Path to the dataset file.

    Returns:
        DataFrame with the file contents.

    Raises:
        HTTPException: 404 if the file is missing, 400 if the contents are
            invalid for the format, 500 otherwise.
    """
    try:
        df = get_format(path).read(path)
        return _infer_datetime_columns(df)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found: {path}") from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}") from e


def save_table_safe(
    df: pd.DataFrame,
    path: Path,
    options: TableWriteOptions | None = None,
) -> None:
    """Save a DataFrame safely, dispatching on the destination file's format.

    Args:
        df: DataFrame to save.
        path: Destination file path; its extension selects the writer.
        options: Optional settings for formats that support configurable writes.

    Raises:
        HTTPException: If the file cannot be saved.
    """
    try:
        get_format(path).write(df, path, options)
    except (ValueError, UnicodeEncodeError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}") from e


def map_dtype(dtype) -> str:
    """Map a pandas dtype to a short label string."""
    kind = dtype.kind

    if kind in ("i", "u"):
        return "int"
    if kind == "f":
        return "float"
    if kind == "b":
        return "bool"
    if kind == "M":
        return "datetime"
    if kind in ("O", "U", "S"):
        return "str"

    return "unknown"


_TIME_SUFFIX = (
    r"(?:[ T]\d{1,2}:\d{2}"
    r"(?::\d{2}(?:\.\d{1,6})?)?"
    r"(?:Z|[+-]\d{2}:?\d{2})?"
    r")?"
)

_DATE_LIKE_PATTERNS = (
    # YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD, optionally with a time.
    re.compile(rf"\d{{4}}([./-])\d{{1,2}}\1\d{{1,2}}{_TIME_SUFFIX}"),
    # DD-MM-YYYY, MM-DD-YYYY and equivalent slash/dot formats.
    re.compile(rf"\d{{1,2}}([./-])\d{{1,2}}\1\d{{4}}{_TIME_SUFFIX}"),
    # January 10, 2024 / Jan 10 2024.
    re.compile(
        rf"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|"
        rf"may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|"
        rf"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        rf"\s+\d{{1,2}},?\s+\d{{4}}{_TIME_SUFFIX}",
        re.IGNORECASE,
    ),
    # 10 January 2024 / 10 Jan 2024.
    re.compile(
        rf"\d{{1,2}}\s+"
        rf"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|"
        rf"may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|"
        rf"oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
        rf"\s+\d{{4}}{_TIME_SUFFIX}",
        re.IGNORECASE,
    ),
)

_AMBIGUOUS_NUMERIC_DATE = re.compile(r"(\d{1,2})([./-])(\d{1,2})\2\d{4}")


def _infer_dayfirst(values: pd.Series) -> bool | None:
    """Infer day-first vs month-first convention from unambiguous rows.

    Returns True/False when rows with one component > 12 disambiguate the
    column's convention. Returns None when the column has evidence for
    both conventions (genuinely inconsistent), so the caller can skip
    inference rather than silently corrupt half the rows.
    """
    day_first = month_first = False
    for value in values:
        match = _AMBIGUOUS_NUMERIC_DATE.fullmatch(value.strip())
        if not match:
            continue
        first, second = int(match.group(1)), int(match.group(3))
        if first > 12 >= second:
            day_first = True
        elif second > 12 >= first:
            month_first = True
    if day_first and month_first:
        return None
    return day_first


def _looks_like_datetime(value: str) -> bool:
    """Return whether a string has the structure of a complete date.

    Bare years, numeric identifiers, short codes, and partial dates are
    intentionally rejected even when pandas could parse them.

    Args:
        value: String value to inspect.

    Returns:
        True if the value resembles a complete date or datetime.
    """
    normalized = value.strip()

    if not normalized:
        return False

    return any(pattern.fullmatch(normalized) for pattern in _DATE_LIKE_PATTERNS)


def _infer_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Infer datetime columns from string/object columns.

    A column is converted only when at least 80% of its non-null string values
    resemble complete dates and can be parsed successfully. Bare years,
    numeric identifiers, short codes, partial dates, mixed date conventions,
    and mixed-type object columns are not inferred as datetime values.

    Numeric day/month dates use one convention for the entire column instead
    of allowing pandas to infer each row independently. Columns containing
    mixed UTC offsets are normalized to UTC when pandas cannot represent them
    directly using a single timezone-aware dtype.

    Args:
        df: Source DataFrame.

    Returns:
        A copied DataFrame with eligible columns converted to datetime dtype.
    """
    df = df.copy()

    string_columns = df.select_dtypes(include=["object", "string"]).columns

    for col in string_columns:
        non_null = df[col].dropna()

        if non_null.empty:
            continue

        string_mask = non_null.map(lambda value: isinstance(value, str))
        string_values = non_null[string_mask]

        if string_values.empty:
            continue

        # Do not infer mixed-type object columns. Parsing the entire column could
        # reinterpret non-string numbers as nanosecond timestamps.
        if len(string_values) != len(non_null):
            continue

        normalized_values = string_values.str.strip()
        date_like_rate = normalized_values.map(_looks_like_datetime).mean()

        if date_like_rate < 0.8:
            continue

        dayfirst = _infer_dayfirst(normalized_values)

        if dayfirst is None:
            # Mixes DD/MM and MM/DD conventions across rows — too ambiguous
            # to guess safely, leave as text.
            continue

        normalized_column = df[col].map(lambda value: value.strip() if isinstance(value, str) else value)

        try:
            converted = pd.to_datetime(
                normalized_column,
                format="mixed",
                dayfirst=dayfirst,
                errors="coerce",
            )
        except ValueError:
            # Mixed UTC offsets ('Z' alongside '+02:00' rows) make pandas
            # raise instead of honoring errors="coerce". Normalize to UTC
            # so the column still parses instead of taking the whole read
            # path down (read_table_safe has no other error boundary here).
            try:
                converted = pd.to_datetime(
                    normalized_column,
                    format="mixed",
                    dayfirst=dayfirst,
                    errors="coerce",
                    utc=True,
                )
            except ValueError:
                # Datetime inference is best effort. A column that still cannot
                # be parsed must remain unchanged rather than making the entire
                # dataset unreadable.
                continue

        # Use all non-null source values as the denominator so the boundary
        # reflects the complete column rather than only the date-shaped subset.
        parse_success_rate = converted[df[col].notna()].notna().mean()

        if parse_success_rate >= 0.8:
            df[col] = converted

    return df


def _format_datetime_columns_for_response(df: pd.DataFrame) -> pd.DataFrame:
    """Format datetime columns for display without changing reported dtypes.

    Date-only columns are returned as ``YYYY-MM-DD``. Columns containing at
    least one meaningful time component are returned as
    ``YYYY-MM-DD HH:MM:SS``.

    Args:
        df: Source DataFrame containing inferred datetime columns.

    Returns:
        A copied DataFrame with datetime columns converted to display strings.
    """
    formatted_df = df.copy()

    datetime_columns = formatted_df.select_dtypes(include=["datetime64[ns]", "datetimetz"]).columns

    for col in datetime_columns:
        series = formatted_df[col]

        non_null = series.dropna()
        if non_null.empty:
            continue

        has_time = (
            non_null.dt.hour.ne(0) | non_null.dt.minute.ne(0) | non_null.dt.second.ne(0) | non_null.dt.microsecond.ne(0)
        ).any()

        if has_time:
            formatted_df[col] = series.dt.strftime("%Y-%m-%d %H:%M:%S")
        else:
            formatted_df[col] = series.dt.strftime("%Y-%m-%d")

    return formatted_df


def dataframe_to_response(df: pd.DataFrame) -> dict[str, Any]:
    """Convert a DataFrame to an API response dict.

    Datetime dtypes are captured before formatting values for display, so the
    response reports ``datetime`` while date-only values do not unnecessarily
    include ``T00:00:00``.

    Args:
        df: Source DataFrame.

    Returns:
        Dict with columns, rows, row_count, and dtypes.
    """
    dtypes = {col: map_dtype(dtype) for col, dtype in df.dtypes.items()}
    columns = df.columns.tolist()

    display_df = _format_datetime_columns_for_response(df)

    # Preserve null semantics: real empty strings stay "", while missing and
    # non-finite values serialize to null.
    normalized_df = display_df.astype(object)
    normalized_df = normalized_df.where(pd.notna(normalized_df), None)
    normalized_df = normalized_df.replace(
        [float("inf"), float("-inf")],
        None,
    )

    rows = normalized_df.values.tolist()

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "dtypes": dtypes,
    }
