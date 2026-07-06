"""Shared pytest fixtures.

The app reads its config (DATABASE_URL, JWT_SECRET, ...) at import time and
caches it, so the test environment MUST be configured before importing the
app. We point it at an isolated temp SQLite database and deterministic secrets,
then give every test a fresh schema + seed data for full isolation.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

# --- configure BEFORE importing the app -----------------------------------
_TMP = tempfile.mkdtemp(prefix="parking-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["JWT_SECRET"] = "test-secret-do-not-use-in-prod-0123456789abcdef"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["PARKING_UPLOADS_DIR"] = f"{_TMP}/uploads"
os.environ["CORS_ALLOW_ORIGINS"] = "http://localhost:8080"

import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    """A TestClient backed by a freshly-created, freshly-seeded database.

    Dropping and recreating per test keeps them fully independent (no shared
    rows leaking across tests).
    """
    Base.metadata.drop_all(bind=engine)
    init_db()
    seed(force=True)
    return TestClient(app)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def inspector_token(client: TestClient) -> str:
    res = client.post("/api/login", json={"username": "insp01", "password": "pass123"})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def _admin_login(client: TestClient, username: str, password: str) -> str:
    res = client.post("/api/admin/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


@pytest.fixture()
def manager_token(client: TestClient) -> str:
    """管理人員: review queue, case search, stats, export."""
    return _admin_login(client, "manager01", "manager123")


@pytest.fixture()
def sysadmin_token(client: TestClient) -> str:
    """系統管理員: inspector accounts, locations, system settings."""
    return _admin_login(client, "sysadmin01", "sysadmin123")


def make_token(username: str, role: str, *, expired: bool = False) -> str:
    """Forge a token with the test secret - used to exercise expiry/role paths."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    if expired:
        iat, exp = now - timedelta(hours=2), now - timedelta(hours=1)
    else:
        iat, exp = now, now + timedelta(hours=1)
    return jwt.encode(
        {"sub": username, "role": role, "iat": iat, "exp": exp},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
