"""Blocker 4 - login rate limiting / lockout.

Unit tests on the LoginThrottle primitive (with an injected clock) plus an
end-to-end assertion that repeated bad logins get locked out with 429.
"""
from __future__ import annotations

from app.rate_limit import LoginThrottle
from tests.conftest import auth  # noqa: F401  (kept for parity with other tests)


def _throttle_with_clock(clock, **kw):
    t = LoginThrottle(**kw)
    t._now = lambda: clock[0]  # type: ignore[method-assign]
    return t


def test_locks_out_after_max_attempts():
    clock = [1000.0]
    t = _throttle_with_clock(clock, max_attempts=3, window_seconds=100, lockout_seconds=60)

    assert t.retry_after("user:a") is None
    t.record_failure("user:a")
    t.record_failure("user:a")
    assert t.retry_after("user:a") is None  # 2 < 3, still allowed
    t.record_failure("user:a")  # 3rd -> locked
    wait = t.retry_after("user:a")
    assert wait is not None and 0 < wait <= 60


def test_lockout_expires():
    clock = [0.0]
    t = _throttle_with_clock(clock, max_attempts=2, window_seconds=100, lockout_seconds=30)
    t.record_failure("k")
    t.record_failure("k")
    assert t.retry_after("k") is not None
    clock[0] += 31  # lockout elapsed
    assert t.retry_after("k") is None


def test_old_failures_fall_out_of_window():
    clock = [0.0]
    t = _throttle_with_clock(clock, max_attempts=3, window_seconds=10, lockout_seconds=10)
    t.record_failure("k")
    t.record_failure("k")
    clock[0] += 20  # both failures now older than the window
    t.record_failure("k")  # only this one counts -> not locked
    assert t.retry_after("k") is None


def test_reset_clears_state():
    clock = [0.0]
    t = _throttle_with_clock(clock, max_attempts=1, window_seconds=10, lockout_seconds=10)
    t.record_failure("k")
    assert t.retry_after("k") is not None
    t.reset("k")
    assert t.retry_after("k") is None


def test_repeated_bad_login_gets_429(client):
    # Default LOGIN_MAX_ATTEMPTS is 5: first 5 wrong attempts are 401, then the
    # account/IP is locked and further attempts (even correct) return 429.
    for _ in range(5):
        res = client.post("/api/login", json={"username": "insp01", "password": "wrong"})
        assert res.status_code == 401

    locked = client.post("/api/login", json={"username": "insp01", "password": "pass123"})
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers


def test_admin_login_is_also_throttled(client):
    for _ in range(5):
        res = client.post("/api/admin/login", json={"username": "manager01", "password": "no"})
        assert res.status_code == 401
    locked = client.post("/api/admin/login", json={"username": "manager01", "password": "manager123"})
    assert locked.status_code == 429
