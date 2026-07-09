"""Login throttling (Blocker 4).

An in-process, thread-safe sliding-window limiter with lockout, applied to the
inspector and admin login endpoints so a stolen/guessed password can't be
brute-forced. After `max_attempts` failures within `window_seconds` for a given
key (a username or a client IP), that key is locked out for `lockout_seconds`.

Scope/limitation (documented, not hidden): state lives in this process's
memory, so it protects a single backend instance. Multiple workers/instances
each keep their own counters; a horizontally-scaled deployment should back this
with a shared store (e.g. Redis) using the same interface. For the prototype's
single-container deployment this is a real, testable improvement over the
previous unlimited-guessing behaviour.

Time is read from `time.monotonic()` so it's immune to wall-clock adjustments.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field


@dataclass
class _KeyState:
    failures: list[float] = field(default_factory=list)  # monotonic timestamps
    locked_until: float | None = None


class LoginThrottle:
    def __init__(
        self,
        max_attempts: int,
        window_seconds: float,
        lockout_seconds: float,
    ) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._state: dict[str, _KeyState] = {}
        self._lock = threading.Lock()

    # Overridable in tests to avoid real sleeping.
    def _now(self) -> float:
        return time.monotonic()

    def retry_after(self, key: str) -> float | None:
        """Seconds the caller must wait, or None if the key is not locked out.

        Also lazily clears an expired lockout so the key gets a fresh window.
        """
        now = self._now()
        with self._lock:
            state = self._state.get(key)
            if state is None or state.locked_until is None:
                return None
            if now >= state.locked_until:
                # Lockout elapsed: reset so the next attempt starts clean.
                self._state.pop(key, None)
                return None
            return state.locked_until - now

    def record_failure(self, key: str) -> None:
        """Record one failed attempt for `key`; may trip the lockout."""
        now = self._now()
        cutoff = now - self.window_seconds
        with self._lock:
            state = self._state.setdefault(key, _KeyState())
            state.failures = [t for t in state.failures if t >= cutoff]
            state.failures.append(now)
            if len(state.failures) >= self.max_attempts:
                state.locked_until = now + self.lockout_seconds

    def reset(self, key: str | None = None) -> None:
        """Clear one key's state, or all of it (used for test isolation)."""
        with self._lock:
            if key is None:
                self._state.clear()
            else:
                self._state.pop(key, None)


def _build_default_throttle() -> LoginThrottle:
    # Imported lazily so importing this module never triggers config loading at
    # import time in unexpected orders; settings are stable once loaded.
    from .config import get_settings

    s = get_settings()
    return LoginThrottle(
        max_attempts=s.login_max_attempts,
        window_seconds=s.login_window_seconds,
        lockout_seconds=s.login_lockout_seconds,
    )


# Process-wide singleton used by the login endpoints.
login_throttle = _build_default_throttle()
