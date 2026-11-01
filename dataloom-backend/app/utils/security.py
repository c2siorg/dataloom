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


def format_size_limit(size_bytes: int) -> str:
    """Format a byte limit for error messages: ``10MB``, or ``10.5MB`` when not a whole megabyte.

    Args:
        size_bytes: The limit in bytes.

    Returns:
        The limit in megabytes, with one decimal only when needed.
    """
    size_mb = size_bytes / (1024 * 1024)
    return f"{int(size_mb)}MB" if size_mb == int(size_mb) else f"{size_mb:.1f}MB"


async def validate_upload_file(file: UploadFile) -> None:
    """Validate an uploaded file extension and size.

    Args:
        file: The FastAPI UploadFile object.

    Raises:
        HTTPException: 400 if the file extension is not allowed, 413 if the file is too large.
    """
    settings = get_settings()

    ext = Path(file.filename).suffix.lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400, detail=f"File type '{ext}' not allowed. Allowed: {settings.allowed_extensions}"
        )

    if file.size is not None:
        if file.size > settings.max_upload_size_bytes:
            limit = format_size_limit(settings.max_upload_size_bytes)
            raise HTTPException(status_code=413, detail=f"File size exceeds the maximum allowed size of {limit}.")
    else:
        await file.seek(0)
        file_size = 0
        while chunk := await file.read(65_536):
            file_size += len(chunk)
            if file_size > settings.max_upload_size_bytes:
                limit = format_size_limit(settings.max_upload_size_bytes)
                raise HTTPException(status_code=413, detail=f"File size exceeds the maximum allowed size of {limit}.")
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


# Node types an advanced-query expression may contain: comparisons, boolean
# logic, arithmetic, column references, literals, and list/tuple literals for
# ``in`` checks. Function calls, attribute access, subscripts, and ``@`` scope
# references are all absent, so they fail closed — the same fail-closed shape
# as the formula allowlist above, widened only where filter grammar needs it.
_ALLOWED_QUERY_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Name,
    ast.Constant,
    ast.List,
    ast.Tuple,
    ast.Load,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.FloorDiv,
    ast.Mod,
    ast.Pow,
    ast.BitAnd,
    ast.BitOr,
    ast.USub,
    ast.UAdd,
    ast.Invert,
    ast.Not,
    ast.And,
    ast.Or,
    ast.Eq,
    ast.NotEq,
    ast.Lt,
    ast.LtE,
    ast.Gt,
    ast.GtE,
    ast.In,
    ast.NotIn,
)


def _substitute_query_column_names(
    expression: str, quoted_cols: list[str], columns: set[str]
) -> tuple[str, dict[str, str]]:
    """Replace non-identifier column references in a query with placeholder identifiers.

    The scan is left to right and steps over string literals and backticked
    names, so text inside a literal is never mistaken for a column reference
    (``city == "unit cost"`` keeps the literal intact even when ``unit cost``
    is also a column), and a shorter column name never claims part of a longer
    one that contains it (``quoted_cols`` is longest-first). Already-backticked
    references go through the same placeholders, so every column reference
    reaches the AST walk in the same shape.

    Args:
        expression: The user-supplied query.
        quoted_cols: Non-identifier column names, longest first.
        columns: Every column name, used to keep placeholders collision-free.

    Returns:
        The rewritten expression, and a placeholder-to-backticked-name mapping.
    """
    placeholder_by_col: dict[str, str] = {}
    placeholders: dict[str, str] = {}
    counter = 0

    def placeholder_for(name: str) -> str:
        nonlocal counter
        placeholder = placeholder_by_col.get(name)
        if placeholder is None:
            while True:
                candidate = f"{_FORMULA_PLACEHOLDER_PREFIX}{counter}"
                counter += 1
                if candidate not in columns and candidate not in placeholders:
                    break
            placeholder_by_col[name] = candidate
            placeholders[candidate] = f"`{name}`"
            placeholder = candidate
        return placeholder

    parts: list[str] = []
    i = 0
    while i < len(expression):
        if expression[i] == "`":
            end = expression.find("`", i + 1)
            if end == -1:
                parts.append(expression[i:])
                break
            parts.append(placeholder_for(expression[i + 1 : end]))
            i = end + 1
            continue
        for col in quoted_cols:
            if expression.startswith(col, i):
                parts.append(placeholder_for(col))
                i += len(col)
                break
        else:
            literal = _FORMULA_STRING_LITERAL.match(expression, i)
            if literal:
                parts.append(literal.group(0))
                i = literal.end()
            else:
                parts.append(expression[i])
                i += 1
    return "".join(parts), placeholders


def _swap_placeholders_outside_literals(expression: str, placeholders: dict[str, str]) -> str:
    """Swap placeholders for their backticked column names, skipping string literals.

    A literal is data, not a column reference, so placeholder-shaped text
    inside one must reach pandas untouched. Longest placeholder first:
    ``_dataloom_col_1`` is a prefix of ``_dataloom_col_10``.
    """
    if not placeholders:
        return expression
    ordered = sorted(placeholders, key=len, reverse=True)

    def swap(chunk: str) -> str:
        for placeholder in ordered:
            chunk = chunk.replace(placeholder, placeholders[placeholder])
        return chunk

    parts: list[str] = []
    pos = 0
    for match in _FORMULA_STRING_LITERAL.finditer(expression):
        parts.append(swap(expression[pos : match.start()]))
        parts.append(match.group(0))
        pos = match.end()
    parts.append(swap(expression[pos:]))
    return "".join(parts)


QUERY_PARSE_ERROR_DETAIL = "Query is not a valid expression"


def prepare_query_expression(expression: str, columns: list[str]) -> str:
    """Validate an advanced-query filter and return the string to execute.

    The query counterpart of :func:`prepare_formula_expression`, with the same
    fail-closed shape: non-identifier column names are substituted with
    placeholder identifiers (longest first, stepping over string literals),
    the result is parsed and walked against an AST allowlist, and the
    executable string is rebuilt from the exact string the walk approved, so
    the validated string and the executed string cannot drift apart.

    The regex screen in :func:`validate_query_string` still runs first as
    defense in depth, but it cannot be the only barrier: numexpr is not a
    project dependency, so ``DataFrame.query`` runs on the Python engine,
    whose scope resolution reaches the calling module's globals through
    ``@name`` references — a filter such as
    ``@pd.read_csv('/path/to/file.csv')`` reads arbitrary files the server
    can read and leaks their contents through the filtered row count. Under
    the allowlist, ``@`` references do not parse at all, and calls, attribute
    access, and subscripts are rejected, so a query can only compare columns
    against literals.

    Bare names are not checked against ``columns`` here: in ``df.query`` a
    bare name can only resolve to a column, and an unknown one raises there,
    which the caller surfaces as a transformation error — the behaviour the
    endpoint has always had.

    Args:
        expression: The user-supplied filter, e.g. ``age > 30 and city == "NY"``.
        columns: Column names of the target DataFrame.

    Returns:
        The expression to hand to ``DataFrame.query``.

    Raises:
        HTTPException: If the query is empty, fails the dangerous-pattern
            screen, contains the reserved placeholder prefix, is not
            parseable, or uses syntax outside the allowlist.
    """
    if not expression or not expression.strip():
        raise HTTPException(status_code=400, detail="Query must not be empty")

    validate_query_string(expression)

    if _FORMULA_PLACEHOLDER_PREFIX in expression:
        raise HTTPException(
            status_code=400,
            detail=f"Query must not contain the reserved prefix '{_FORMULA_PLACEHOLDER_PREFIX}'",
        )

    quoted_cols = sorted((col for col in columns if not _is_bare_column_name(col)), key=len, reverse=True)
    sanitized, placeholders = _substitute_query_column_names(expression, quoted_cols, set(columns))
    sanitized = sanitized.strip()

    # ``@name`` scope references are the escape hatch this validation exists
    # to close; reject them explicitly (with literals blanked out, so an
    # email-shaped string value is not a false positive) instead of leaving
    # them to fail the parse below as a generic syntax error.
    if "@" in _FORMULA_STRING_LITERAL.sub('""', sanitized):
        raise HTTPException(status_code=400, detail="Query scope references ('@name') are not supported")

    try:
        tree = ast.parse(sanitized, mode="eval")
    except SyntaxError as e:
        raise HTTPException(status_code=400, detail=QUERY_PARSE_ERROR_DETAIL) from e

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_QUERY_NODES):
            raise HTTPException(
                status_code=400,
                detail=f"Query contains unsupported syntax: {type(node).__name__}",
            )
        if isinstance(node, ast.Constant) and not isinstance(node.value, int | float | str | bool | None):
            raise HTTPException(status_code=400, detail="Query literals must be numbers, strings, booleans, or None")

    return _swap_placeholders_outside_literals(sanitized, placeholders)


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


def safe_http_exception_detail(error: HTTPException) -> str | None:
    """Return a redacted detail for sensitive HTTPException payloads.

    Returns None when the detail is already safe to show. Shared by the transform
    endpoint and the job runner: ``read_table_safe`` embeds absolute paths in its
    404/500 details, and neither caller may hand those to the client.
    """
    detail = error.detail if isinstance(error.detail, str) else ""
    lowered = detail.lower()

    if error.status_code >= 500:
        return "Internal server error"

    # Utility-layer file 404s may embed absolute paths.
    if error.status_code == 404 and "file not found" in lowered:
        return "File not found"

    if detail and (re.search(r"[A-Za-z]:\\[^\\\n]+", detail) or re.search(r"/(?:[^/\n]+/)+[^/\n]+", detail)):
        return "Resource not found" if error.status_code == 404 else "Internal server error"

    return None
