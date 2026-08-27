"""CORS origin allowlist behavior (#195).

Vite falls back from 3200 to 3201 when the primary port is already bound, so
the backend must accept both — and must still reject an origin that isn't on
the list.
"""


class TestCorsOrigins:
    def test_allows_the_primary_dev_origin(self, anon_client):
        response = anon_client.options(
            "/auth/signin",
            headers={
                "Origin": "http://localhost:3200",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3200"

    def test_allows_the_vite_fallback_origin(self, anon_client):
        response = anon_client.options(
            "/auth/signin",
            headers={
                "Origin": "http://localhost:3201",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.headers.get("access-control-allow-origin") == "http://localhost:3201"

    def test_rejects_an_unrelated_origin(self, anon_client):
        response = anon_client.options(
            "/auth/signin",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert "access-control-allow-origin" not in response.headers
