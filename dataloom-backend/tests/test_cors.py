"""Tests for CORS configuration."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


class TestCorsOrigins:
    def test_fallback_vite_port_allowed(self):
        with TestClient(app) as client:
            response = client.options(
                "/projects/recent",
                headers={
                    "Origin": "http://localhost:3210",
                    "Access-Control-Request-Method": "GET",
                },
            )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3210"

    def test_unrelated_origin_rejected(self):
        with TestClient(app) as client:
            response = client.options(
                "/projects/recent",
                headers={
                    "Origin": "http://evil.example.com",
                    "Access-Control-Request-Method": "GET",
                },
            )
        assert "access-control-allow-origin" not in response.headers

    def test_origin_regex_is_disabled_by_default(self, monkeypatch):
        monkeypatch.delenv("CORS_ORIGIN_REGEX", raising=False)
        settings = Settings(database_url="sqlite:///./test.db", jwt_secret="test-secret")

        assert settings.cors_origin_regex is None
