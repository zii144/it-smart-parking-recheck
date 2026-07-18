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
        "change-me-to-a-long-random-string",  # the exact .env.example placeholder (33 chars)
        "prod-secret-please-change-this-now",  # long, but still an un-substituted placeholder
        "REPLACE-ME-with-a-real-value-here",   # long placeholder via substring heuristic
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


def test_production_force_disables_demo_seed_and_mock_site(monkeypatch):
    """Even if the env explicitly asks for demo data / the mock QR site, a
    production deploy must never create the known-credential demo accounts or
    expose the unauthenticated mock endpoint (defense-in-depth for the seeded
    sysadmin)."""
    s = _settings(
        monkeypatch,
        APP_ENV="production",
        JWT_SECRET="a-sufficiently-long-random-secret-1234567890",
        SEED_DEMO_DATA="true",
        QR_MOCK_SITE_ENABLED="true",
    )
    assert s.seed_demo_requested is True   # the env asked for it...
    assert s.seed_demo_data is False       # ...but production overrides it off
    assert s.qr_mock_site_enabled is False


def test_development_keeps_demo_seed_on(monkeypatch):
    s = _settings(
        monkeypatch,
        APP_ENV="development",
        JWT_SECRET="dev-insecure-change-me",
        SEED_DEMO_DATA=None,  # default
    )
    assert s.seed_demo_data is True
    assert s.qr_mock_site_enabled is True
