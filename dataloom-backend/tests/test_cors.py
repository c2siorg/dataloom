"""Tests for CORS configuration."""

from fastapi.testclient import TestClient

from app.main import app


class TestCorsOrigins:
    def test_fallback_vite_port_allowed(self):
        with TestClient(app) as client:
            response = client.options(
                "/projects/recent",
                headers={
                    "Origin": "http://localhost:3201",
                    "Access-Control-Request-Method": "GET",
                },
            )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3201"

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
