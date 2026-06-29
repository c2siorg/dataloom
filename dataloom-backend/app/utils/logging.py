"""Logging configuration for the DataLoom backend.

Provides structured JSON logging with request correlation support.
Every ``app.*`` module logger emits JSON lines to stdout, with an optional
``request_id`` field correlated across all log entries within an HTTP request
via a ``contextvars.ContextVar``.
"""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    """Format log records as JSON lines.

    The output always contains ``timestamp``, ``level``, ``logger``, and
    ``message`` keys.  If a ``request_id`` is set on the current execution
    context via ``request_id_var`` it is included.  Exception tracebacks
    are serialised under an ``exception`` key when present.
    """

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        rid = request_id_var.get()
        if rid:
            log_entry["request_id"] = rid

        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, ensure_ascii=False, default=str)


def setup_logging(debug: bool = False) -> None:
    """Configure the ``app`` logger with JSON output.

    Uses ``app`` as the parent logger so that all ``app.*`` module loggers
    produce structured JSON lines.  Propagation is disabled to avoid
    duplicate output when uvicorn (or any other framework) has already
    configured the root logger.

    Args:
        debug: If True, set log level to DEBUG. Otherwise, use INFO.
    """
    level = logging.DEBUG if debug else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(JSONFormatter())

    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)

    if not app_logger.handlers:
        app_logger.addHandler(handler)

    app_logger.propagate = False


def get_logger(name: str) -> logging.Logger:
    """Return a named logger.

    Args:
        name: The logger name, typically ``__name__`` of the calling module.

    Returns:
        A :class:`logging.Logger` instance.
    """
    return logging.getLogger(name)
