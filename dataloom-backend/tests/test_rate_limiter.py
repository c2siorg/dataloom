"""Unit tests for the sliding-window rate limiter."""

import pytest

from app.utils.rate_limiter import RateLimiter


class _FakeClock:
    """Deterministic clock for testing sliding-window behaviour."""

    def __init__(self, start: float = 0.0) -> None:
        self._now = start

    def advance(self, seconds: float) -> None:
        self._now += seconds

    def __call__(self) -> float:
        return self._now


class TestRateLimiter:
    def test_allows_requests_under_limit(self):
        clock = _FakeClock()
        limiter = RateLimiter(max_requests=5, window_seconds=10, time_func=clock)

        for _ in range(5):
            allowed, retry_after = limiter.check("ip-1")
            assert allowed
            assert retry_after == 0.0
            clock.advance(0.1)

    def test_denies_request_at_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=10)

        for _ in range(3):
            limiter.check("ip-1")

        allowed, retry_after = limiter.check("ip-1")
        assert not allowed
        assert retry_after > 0.0

    def test_allows_request_from_different_key(self):
        limiter = RateLimiter(max_requests=1, window_seconds=10)

        limiter.check("ip-1")
        allowed, _ = limiter.check("ip-2")
        assert allowed

    def test_window_expiry_resets_counter(self):
        clock = _FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10, time_func=clock)

        limiter.check("ip-1")
        limiter.check("ip-1")

        allowed, _ = limiter.check("ip-1")
        assert not allowed

        clock.advance(10.0)

        allowed, _ = limiter.check("ip-1")
        assert allowed

    def test_partial_window_slide(self):
        clock = _FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10, time_func=clock)

        limiter.check("ip-1")
        clock.advance(5.0)
        limiter.check("ip-1")
        assert not limiter.check("ip-1")[0]

        clock.advance(5.0)

        allowed, _ = limiter.check("ip-1")
        assert allowed

    def test_constructed_with_retry_after(self):
        clock = _FakeClock()
        limiter = RateLimiter(max_requests=2, window_seconds=10, time_func=clock)

        limiter.check("ip-1")
        limiter.check("ip-1")
        _, retry_after = limiter.check("ip-1")

        assert 9.0 <= retry_after <= 10.0

    def test_reset_single_key(self):
        limiter = RateLimiter(max_requests=1, window_seconds=10)
        limiter.check("ip-1")
        limiter.reset("ip-1")

        allowed, _ = limiter.check("ip-1")
        assert allowed

    def test_reset_all_keys(self):
        limiter = RateLimiter(max_requests=1, window_seconds=10)
        limiter.check("ip-1")
        limiter.check("ip-2")
        limiter.reset()

        assert limiter.check("ip-1")[0]
        assert limiter.check("ip-2")[0]

    def test_zero_or_negative_max_requests_rejected(self):
        import re

        match = "max_requests must be >= 1"
        with pytest.raises(ValueError, match=re.escape(match)):
            RateLimiter(max_requests=0, window_seconds=10)

    def test_zero_or_negative_window_rejected(self):
        import re

        match = "window_seconds must be >= 1"
        with pytest.raises(ValueError, match=re.escape(match)):
            RateLimiter(max_requests=5, window_seconds=0)

    def test_unknown_key_allowed(self):
        limiter = RateLimiter(max_requests=5, window_seconds=10)
        allowed, _ = limiter.check("never-seen")
        assert allowed

    def test_high_volume_does_not_deadlock(self):
        import concurrent.futures

        clock = _FakeClock()
        limiter = RateLimiter(max_requests=100, window_seconds=60, time_func=clock)

        def _hit(key: str) -> bool:
            return limiter.check(key)[0]

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(_hit, "shared") for _ in range(200)]
            results = [f.result() for f in futures]

        assert sum(results) == 100
