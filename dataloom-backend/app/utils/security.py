"""Security utilities for file upload validation, path safety, and query sanitization."""

import ast
import keyword
import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import get_settings


def sanitize_filename(filename: str) -> str:
    """Sanitize an uploaded filename to prevent path traversal and naming conflicts.

    Strips directory components, replaces unsafe characters, and prepends a UUID
    to guarantee uniqueness.

    Args:
        filename: The original filename from the upload.

    Returns:
        A safe, unique filename string.
    """
    name = Path(filename).name
    name = re.sub(r"[^\w.\-]", "_", name)
    return f"{uuid.uuid4().hex[:8]}_{name}"


async def validate_upload_file(file: UploadFile) -> None:
    """Validate an uploaded file extension and size.

    Args:
        file: The FastAPI UploadFile object.

    Raises:
        HTTPException: If the file extension is not allowed or the file is too large.
    """
    settings = get_settings()

    ext = Path(file.filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {settings.allowed_extensions}"
        )

    if file.size is not None:
        if file.size > settings.max_upload_size_bytes:
            max_size_mb = settings.max_upload_size_bytes / (1024 * 1024)
            mb_str = f"{int(max_size_mb)}MB" if max_size_mb == int(max_size_mb) else f"{max_size_mb:.1f}MB"
            raise HTTPException(
                status_code=400,
                detail=f"File size exceeds the maximum allowed size of {mb_str}.",
            )
    else:
        await file.seek(0)
        file_size = 0
        while chunk := await file.read(65_536):
            file_size += len(chunk)
            if file_size > settings.max_upload_size_bytes:
                max_size_mb = settings.max_upload_size_bytes / (1024 * 1024)
                mb_str = f"{int(max_size_mb)}MB" if max_size_mb == int(max_size_mb) else f"{max_size_mb:.1f}MB"
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds the maximum allowed size of {mb_str}.",
                )
        await file.seek(0)


def resolve_upload_path(filename: str) -> Path:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir).resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    target = (upload_dir / filename).resolve()
    if not str(target).startswith(str(upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid file path")
    return target


_DANGEROUS_PATTERNS = [
    r"__import__",
    r"__builtins__",
    r"__class__",
    r"__subclasses__",
    r"__globals__",
    r"\bexec\b",
    r"\bos\b\s*\.",
    r"\bsys\b\s*\.",
    r"\blambda\b",
    r"\bopen\b\s*\(",
    r"\bcompile\b\s*\(",
    r"__\w+__",
]


def validate_query_string(query: str) -> str:
    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, query, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Query contains potentially dangerous expressions")
    return query


# Node types a formula expression may contain: arithmetic, comparisons, boolean
# logic, column references, and literals. Function calls, attribute access,
# subscripts, lambdas, and comprehensions are all absent, so they fail closed.
_ALLOWED_FORMULA_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Name,
    ast.Constant,
    ast.Load,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.USub,
    ast.UAdd,
    ast.Not,
    ast.And,
    ast.Or,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
)


_FORMULA_PLACEHOLDER_PREFIX = "_dataloom_col_"

# A single-quoted or double-quoted run with no line break and no embedded quote
# of the same kind. Escapes are not supported: a literal containing a backslash
# fails to match here and then fails the parse, which is the safe outcome.
_FORMULA_STRING_LITERAL = re.compile(r"'[^'\n]*'|\"[^\"\n]*\"")


def _is_bare_column_name(col: str) -> bool:
    """Return True when a column name can appear in a formula as a plain Python name.

    Python keywords are excluded: a column called ``True`` or ``None`` is a
    valid identifier but parses as a constant, so it needs the same
    placeholder-and-backtick handling as a name containing spaces.
    """
    return col.isidentifier() and not keyword.iskeyword(col)


def _normalize_string_literal(literal: str) -> str:
    """Return a string literal in the double-quoted form pandas' parser wants.

    Args:
        literal: The literal exactly as the user wrote it, quotes included.

    Returns:
        The same literal, double-quoted.

    Raises:
        HTTPException: If a single-quoted literal contains a double quote, which
            cannot survive the conversion.
    """
    if literal.startswith('"'):
        return literal
    body = literal[1:-1]
    if '"' in body:
        raise HTTPException(
            status_code=400,
            detail="Formula string literals must not mix quote characters",
        )
    return f'"{body}"'


def _substitute_column_names(expression: str, quoted_cols: list[str]) -> tuple[str, dict[str, str]]:
    """Replace non-identifier column names with placeholder identifiers.

    The expression is scanned left to right, so a column name and a string
    literal can never claim the same characters. Text inside a literal is copied
    through untouched, which keeps a literal that reads exactly like a column
    name (``status == "unit cost"``) from turning into a column reference.

    Args:
        expression: The user-supplied formula.
        quoted_cols: Non-identifier column names, longest first, so a short name
            never claims part of a longer one that contains it.

    Returns:
        The rewritten expression, and a placeholder-to-backticked-name mapping.

    Raises:
        HTTPException: If a string literal cannot be normalized.
    """
    placeholder_by_col: dict[str, str] = {}
    placeholders: dict[str, str] = {}
    parts: list[str] = []
    i = 0
    while i < len(expression):
        for col in quoted_cols:
            if expression.startswith(col, i):
                placeholder = placeholder_by_col.get(col)
                if placeholder is None:
                    placeholder = f"{_FORMULA_PLACEHOLDER_PREFIX}{len(placeholder_by_col)}"
                    placeholder_by_col[col] = placeholder
                    placeholders[placeholder] = f"`{col}`"
                parts.append(placeholder)
                i += len(col)
                break
        else:
            literal = _FORMULA_STRING_LITERAL.match(expression, i)
            if literal:
                parts.append(_normalize_string_literal(literal.group(0)))
                i = literal.end()
            else:
                parts.append(expression[i])
                i += 1
    return "".join(parts), placeholders


def prepare_formula_expression(expression: str, columns: list[str]) -> str:
    """Validate a computed-column formula and return the string to evaluate.

    Column names that cannot appear as a plain Python name are substituted with
    placeholder identifiers (longest name first, so a short name never corrupts
    a longer one that contains it) so they parse as a single node. The
    substitution scans the expression left to right and steps over string
    literals, so a literal is never mistaken for a column name. Any name that
    is neither a column nor a placeholder is rejected.

    The returned expression is rebuilt from the exact string the AST walk
    approved, with each placeholder swapped for its backtick-wrapped column
    name. The validated string and the executed string therefore cannot drift
    apart.

    Args:
        expression: The user-supplied formula, e.g. ``price * quantity``.
        columns: Column names of the target DataFrame.

    Returns:
        The expression to hand to ``DataFrame.eval``.

    Raises:
        HTTPException: If the expression is empty, fails the dangerous-pattern
            screen, mixes quote characters inside a string literal, is not
            parseable, or contains disallowed syntax.
    """
    if not expression or not expression.strip():
        raise HTTPException(status_code=400, detail="Formula expression must not be empty")

    for pattern in _DANGEROUS_PATTERNS:
        if re.search(pattern, expression, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="Formula contains potentially dangerous expressions")

    if _FORMULA_PLACEHOLDER_PREFIX in expression:
        raise HTTPException(
            status_code=400,
            detail=f"Formula must not contain the reserved prefix '{_FORMULA_PLACEHOLDER_PREFIX}'",
        )

    allowed_names = {col for col in columns if _is_bare_column_name(col)}
    quoted_cols = sorted((col for col in columns if not _is_bare_column_name(col)), key=len, reverse=True)
    sanitized, placeholders = _substitute_column_names(expression, quoted_cols)
    sanitized = sanitized.strip()
    allowed_names.update(placeholders)

    try:
        tree = ast.parse(sanitized, mode="eval")
    except SyntaxError as e:
        raise HTTPException(status_code=400, detail="Formula is not a valid expression") from e

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_FORMULA_NODES):
            raise HTTPException(
                status_code=400,
                detail=f"Formula contains unsupported syntax: {type(node).__name__}",
            )
        if isinstance(node, ast.Name) and node.id not in allowed_names:
            raise HTTPException(status_code=400, detail=f"Unknown column or name '{node.id}' in formula")
        if isinstance(node, ast.Constant) and not isinstance(node.value, int | float | str | bool):
            raise HTTPException(status_code=400, detail="Formula literals must be numbers, strings, or booleans")

    # Longest placeholder first: "_dataloom_col_1" is a prefix of "_dataloom_col_10".
    executable = sanitized
    for placeholder in sorted(placeholders, key=len, reverse=True):
        executable = executable.replace(placeholder, placeholders[placeholder])
    return executable


SAFE_TRANSFORMATION_ERROR_DETAIL = "Invalid transformation request"

_SENSITIVE_TOKEN_MARKERS = (
    "traceback",
    "sqlalchemy",
    "psycopg",
    "sqlite",
    "postgres",
    "password",
    "secret",
    "token",
)
_SQL_MARKERS = ("select ", "insert ", "update ", "delete ", "drop ", "alter ", "create table", " from ", " where ")


def safe_transformation_error_detail(error: Exception) -> str:
    """Return a client-safe 400 detail for domain transformation failures.

    Shared by the transform endpoint and the pipeline apply endpoint, which
    surface failures raised by the same transformation registry.
    """
    detail = str(error).strip()
    if not detail:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    lowered = detail.lower()

    if "\n" in detail or "\r" in detail:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    if any(token in lowered for token in _SENSITIVE_TOKEN_MARKERS):
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    # Redact SQL-like payloads only when multiple SQL markers co-occur.
    if sum(marker in lowered for marker in _SQL_MARKERS) >= 2:
        return SAFE_TRANSFORMATION_ERROR_DETAIL

    # Redact likely filesystem paths that should not be exposed to clients.
    if re.search(r"[A-Za-z]:\\[^\\\n]+", detail) or re.search(r"/(?:[^/\n]+/)+[^/\n]+", detail):
        return SAFE_TRANSFORMATION_ERROR_DETAIL
    return detail
