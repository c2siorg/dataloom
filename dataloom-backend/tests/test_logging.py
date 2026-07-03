"""Tests for the structured JSON logging formatter.

These tests exercise ``JSONFormatter`` in isolation, without any HTTP or
database fixtures, since the formatter is a pure ``logging.Formatter``.
"""

import json
import logging

from app.utils.logging import JSONFormatter, request_id_var


def _make_record(msg: str = "request complete", extra: dict | None = None) -> logging.LogRecord:
    record = logging.LogRecord("app.test", logging.INFO, "path", 1, msg, None, None)
    for key, value in (extra or {}).items():
        setattr(record, key, value)
    return record


def test_plain_record_emits_only_base_fields():
    """A record with no extras must not leak standard LogRecord attributes.

    On Python 3.12+ every LogRecord carries a standard ``taskName`` attribute;
    it must be excluded rather than surfaced as a spurious top-level JSON key.
    """
    output = JSONFormatter().format(_make_record())
    entry = json.loads(output)

    assert set(entry.keys()) == {"timestamp", "level", "logger", "message"}
    assert "taskName" not in entry


def test_taskName_is_not_surfaced():
    record = _make_record()
    # taskName is a standard attribute on Python 3.12+; force it here so the
    # test also guards the behavior on earlier runtimes.
    record.taskName = "Task-1"

    entry = json.loads(JSONFormatter().format(record))

    assert "taskName" not in entry


def test_extra_fields_still_pass_through():
    """Genuine extras passed via ``Logger.extra`` remain top-level JSON keys."""
    output = JSONFormatter().format(
        _make_record(
            extra={
                "method": "GET",
                "path": "/projects/recent",
                "status_code": 200,
                "duration_ms": 12.5,
            }
        )
    )
    entry = json.loads(output)

    assert entry["method"] == "GET"
    assert entry["path"] == "/projects/recent"
    assert entry["status_code"] == 200
    assert entry["duration_ms"] == 12.5


def test_request_id_included_when_set():
    token = request_id_var.set("abc-123")
    try:
        entry = json.loads(JSONFormatter().format(_make_record()))
    finally:
        request_id_var.reset(token)

    assert entry["request_id"] == "abc-123"
