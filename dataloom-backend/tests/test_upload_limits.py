"""Tests for the streamed upload size limit (app/utils/upload_limits.py)."""

import json
import uuid

import pytest

from app.config import get_settings
from app.utils.upload_limits import UPLOAD_BODY_OVERHEAD_BYTES, UploadSizeLimitMiddleware, UploadTooLarge

LIMIT = 512 * 1024  # 0.5MB
BUDGET = LIMIT + UPLOAD_BODY_OVERHEAD_BYTES
LIMIT_DETAIL = "File exceeds the maximum upload size of 0.5MB."

BOUNDARY = "dataloom-test-boundary"
MULTIPART_HEADERS = {"Content-Type": f"multipart/form-data; boundary={BOUNDARY}"}

UPLOAD_PATHS = [
    "/projects/upload",
    f"/projects/{uuid.uuid4()}/files",
    f"/projects/{uuid.uuid4()}/files/preview",
]


@pytest.fixture(autouse=True)
def small_upload_limit(monkeypatch):
    """Shrink the upload limit so over-budget bodies stay small."""
    monkeypatch.setenv("MAX_UPLOAD_SIZE_BYTES", str(LIMIT))
    get_settings.cache_clear()
    yield
    monkeypatch.undo()
    get_settings.cache_clear()


def _scope(path: str = "/projects/upload", method: str = "POST", content_length: int | None = None) -> dict:
    headers = [] if content_length is None else [(b"content-length", str(content_length).encode())]
    return {"type": "http", "method": method, "path": path, "headers": headers}


class _Sent:
    """ASGI send callable that records the response."""

    def __init__(self):
        self.messages = []

    async def __call__(self, message):
        self.messages.append(message)

    @property
    def status(self) -> int:
        return next(m["status"] for m in self.messages if m["type"] == "http.response.start")

    @property
    def json(self) -> dict:
        return json.loads(b"".join(m.get("body", b"") for m in self.messages if m["type"] == "http.response.body"))


class _ChunkedReceive:
    """ASGI receive callable that yields the given chunks and counts calls."""

    def __init__(self, chunks: list[bytes]):
        self._chunks = chunks
        self.calls = 0

    async def __call__(self):
        chunk = self._chunks[self.calls]
        self.calls += 1
        return {"type": "http.request", "body": chunk, "more_body": self.calls < len(self._chunks)}


async def _forbidden_receive():
    raise AssertionError("receive must not be awaited")


async def _forbidden_app(scope, receive, send):
    raise AssertionError("the app must not be called")


async def _drain_app(scope, receive, send):
    """Read the whole body, then answer 200 with the byte count."""
    total = 0
    more = True
    while more:
        message = await receive()
        total += len(message.get("body", b""))
        more = message.get("more_body", False)
    body = json.dumps({"received": total}).encode()
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": body})


def _multipart(file_size: int) -> bytes:
    head = (
        f"--{BOUNDARY}\r\n"
        'Content-Disposition: form-data; name="file"; filename="big.csv"\r\n'
        "Content-Type: text/csv\r\n\r\n"
    ).encode()
    return head + b"a" * file_size + f"\r\n--{BOUNDARY}--\r\n".encode()


def _streamed(body: bytes, chunk_size: int = 256 * 1024):
    """Yield the body in chunks, so httpx sends it chunked with no Content-Length."""
    for start in range(0, len(body), chunk_size):
        yield body[start : start + chunk_size]


class TestMiddleware:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("path", UPLOAD_PATHS)
    async def test_content_length_over_budget_is_rejected_before_reading(self, path):
        sent = _Sent()

        await UploadSizeLimitMiddleware(_forbidden_app)(
            _scope(path, content_length=BUDGET + 1), _forbidden_receive, sent
        )

        assert sent.status == 413
        assert sent.json == {"detail": LIMIT_DETAIL}

    @pytest.mark.asyncio
    async def test_streamed_body_is_rejected_once_count_passes_budget(self):
        mib = 1024 * 1024
        receive = _ChunkedReceive([b"a" * mib] * 4)

        with pytest.raises(UploadTooLarge) as exc_info:
            await UploadSizeLimitMiddleware(_drain_app)(_scope(), receive, _Sent())

        assert exc_info.value.status_code == 413
        assert exc_info.value.detail == LIMIT_DETAIL
        # 2 MiB is within the 2.5 MiB budget; the third chunk crosses it.
        assert receive.calls == 3

    @pytest.mark.asyncio
    async def test_body_under_budget_passes_through(self):
        chunks = [b"a" * (512 * 1024)] * 4  # 2 MiB, under the budget
        sent = _Sent()

        await UploadSizeLimitMiddleware(_drain_app)(
            _scope(content_length=sum(map(len, chunks))), _ChunkedReceive(chunks), sent
        )

        assert sent.status == 200
        assert sent.json == {"received": 2 * 1024 * 1024}

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("POST", "/auth/signin"),
            ("POST", f"/projects/{uuid.uuid4()}/files/{uuid.uuid4()}/append"),
            ("GET", "/projects/upload"),
        ],
    )
    async def test_other_requests_are_untouched(self, method, path):
        seen = {}

        async def app(scope, receive, send):
            seen["receive"] = receive

        await UploadSizeLimitMiddleware(app)(
            _scope(path, method=method, content_length=BUDGET + 1), _forbidden_receive, _Sent()
        )

        assert seen["receive"] is _forbidden_receive


class TestThroughApp:
    def test_over_budget_upload_carries_cors_headers(self, client):
        origin = get_settings().cors_origins[0]

        response = client.post(
            "/projects/upload", content=_multipart(BUDGET), headers={**MULTIPART_HEADERS, "Origin": origin}
        )

        assert response.status_code == 413
        assert response.json() == {"detail": LIMIT_DETAIL}
        assert response.headers["access-control-allow-origin"] == origin

    def test_streamed_over_budget_upload_gets_413_with_cors_headers(self, client):
        origin = get_settings().cors_origins[0]

        response = client.post(
            "/projects/upload",
            content=_streamed(_multipart(BUDGET)),
            headers={**MULTIPART_HEADERS, "Origin": origin},
        )

        assert "content-length" not in {k.lower() for k in response.request.headers}
        assert response.status_code == 413
        assert response.json() == {"detail": LIMIT_DETAIL}
        assert response.headers["access-control-allow-origin"] == origin

    @pytest.mark.parametrize("streamed", [False, True], ids=["content-length", "streamed"])
    def test_anonymous_over_budget_upload_gets_413_not_401(self, anon_client, streamed):
        body = _multipart(BUDGET)

        response = anon_client.post(
            "/projects/upload", content=_streamed(body) if streamed else body, headers=MULTIPART_HEADERS
        )

        assert response.status_code == 413
        assert response.json() == {"detail": LIMIT_DETAIL}

    def test_file_over_limit_but_within_budget_gets_413_from_validation(self, client):
        response = client.post(
            "/projects/upload",
            files={"file": ("big.csv", b"a" * (LIMIT + 1), "text/csv")},
            data={"projectName": "big", "projectDescription": "too big"},
        )

        assert response.status_code == 413
        assert response.json() == {"detail": "File size exceeds the maximum allowed size of 0.5MB."}


class TestUploadLimitsEndpoint:
    def test_returns_configured_limit(self, client):
        response = client.get("/projects/upload-limits")

        assert response.status_code == 200
        assert response.json() == {"max_upload_size_bytes": LIMIT}

    def test_requires_auth(self, anon_client):
        assert anon_client.get("/projects/upload-limits").status_code == 401
