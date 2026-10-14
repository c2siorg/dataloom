"""Upload size enforcement while the request body is still streaming in.

FastAPI parses a multipart body (``await request.form()``) before it resolves
any dependency, and Starlette spools file parts to disk with no size limit. By
the time ``get_current_user`` or ``validate_upload_file`` runs, the whole body
has been read. ``UploadSizeLimitMiddleware`` rejects an oversized upload from
its ``Content-Length`` before reading anything, or from a running byte count as
the body arrives.
"""

import re

from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings
from app.utils.security import format_size_limit

# Multipart boundaries plus up to two text fields; Starlette caps each
# non-file field at 1 MiB.
UPLOAD_BODY_OVERHEAD_BYTES = 2 * 1024 * 1024

# POST /projects/upload, /projects/{id}/files and /projects/{id}/files/preview.
_UPLOAD_PATH = re.compile(r"^/projects/(?:upload|[^/]+/files(?:/preview)?)$")


class UploadTooLarge(HTTPException):
    """413 for an upload whose body exceeds the configured limit."""

    def __init__(self, limit_bytes: int) -> None:
        super().__init__(
            status_code=413,
            detail=f"File exceeds the maximum upload size of {format_size_limit(limit_bytes)}.",
        )

    def as_response(self) -> JSONResponse:
        return JSONResponse({"detail": self.detail}, status_code=self.status_code, headers=self.headers)


def _content_length(scope: Scope) -> int | None:
    """Return the request's Content-Length when present and numeric, else None."""
    for name, value in scope["headers"]:
        if name == b"content-length":
            return int(value) if value.isdigit() else None
    return None


class UploadSizeLimitMiddleware:
    """Pure ASGI middleware that caps upload request bodies.

    Applies only to POSTs on the upload routes. The budget is
    ``max_upload_size_bytes`` (read per request) plus
    ``UPLOAD_BODY_OVERHEAD_BYTES``. A declared ``Content-Length`` over budget
    gets a 413 without reading the body or calling the app; otherwise the
    wrapped ``receive`` raises ``UploadTooLarge`` as soon as the running byte
    count passes the budget, and FastAPI renders it as a 413.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or not _UPLOAD_PATH.match(scope["path"]):
            await self.app(scope, receive, send)
            return

        limit_bytes = get_settings().max_upload_size_bytes
        budget = limit_bytes + UPLOAD_BODY_OVERHEAD_BYTES

        content_length = _content_length(scope)
        if content_length is not None and content_length > budget:
            error = UploadTooLarge(limit_bytes)
            response = error.as_response()
            await response(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > budget:
                    raise UploadTooLarge(limit_bytes)
            return message

        await self.app(scope, limited_receive, send)
