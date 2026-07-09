"""Blocker 3 - production fail-fast on a weak/default JWT secret.

check_runtime_safety() must raise in production for a weak/default/placeholder
secret, accept a strong one, and stay a no-op in development.
"""
from __future__ import annotations

import pytest

from app.config import Settings


def _settings(monkeypatch, **env) -> Settings:
    for k, v in env.items():
        if v is None:
            monkeypatch.delenv(k, raising=False)
        else:
            monkeypatch.setenv(k, v)
    return Settings()  # constructed fresh (bypasses the lru_cache singleton)


@pytest.mark.parametrize(
    "secret",
    [
        "dev-insecure-change-me",              # code default
        "please-change-me-before-deploying",  # old compose placeholder
        "short",                               # too short
    ],
)
def test_production_rejects_weak_secret(monkeypatch, secret):
    s = _settings(monkeypatch, APP_ENV="production", JWT_SECRET=secret)
    assert s.jwt_secret_is_weak is True
    with pytest.raises(RuntimeError):
        s.check_runtime_safety()


def test_production_accepts_strong_secret(monkeypatch):
    s = _settings(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a-sufficiently-long-random-secret-1234567890",
    )
    assert s.jwt_secret_is_weak is False
    s.check_runtime_safety()  # must not raise


def test_development_allows_default_secret(monkeypatch):
    s = _settings(monkeypatch, APP_ENV="development", JWT_SECRET="dev-insecure-change-me")
    assert s.is_production is False
    s.check_runtime_safety()  # no-op in dev
