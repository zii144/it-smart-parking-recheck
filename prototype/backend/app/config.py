"""Central runtime configuration, read from environment variables.

Everything that used to be a hard-coded prototype constant (the DB location,
the CORS wildcard, the "token = base64(username)" scheme) is now driven from
here so the same image can run locally against SQLite and in a real
deployment against PostgreSQL with a proper signing secret and a locked-down
origin list. Dev-friendly defaults are provided so `uvicorn app.main:app`
still works out of the box, but the production-sensitive ones (JWT_SECRET,
CORS origins, DATABASE_URL) are all overridable.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _default_database_url() -> str:
    # Local dev default: a SQLite file next to the backend package, matching
    # the old PARKING_DB_PATH behaviour so nothing breaks for someone who just
    # runs the API directly. Real deployments set DATABASE_URL to a
    # postgresql+psycopg2://... URL (see docker-compose.yml).
    sqlite_path = os.environ.get("PARKING_DB_PATH", str(BASE_DIR / "parking.db"))
    return f"sqlite:///{sqlite_path}"


class Settings:
    def __init__(self) -> None:
        self.database_url: str = os.environ.get("DATABASE_URL", _default_database_url())

        self.uploads_dir: Path = Path(
            os.environ.get("PARKING_UPLOADS_DIR", str(BASE_DIR / "uploads"))
        )

        # JWT signing. HS256 with a shared secret. The dev default is clearly
        # marked as insecure; production MUST set JWT_SECRET (the app warns at
        # startup if it's left at the default).
        self.jwt_secret: str = os.environ.get("JWT_SECRET", "dev-insecure-change-me")
        self.jwt_algorithm: str = "HS256"
        self.jwt_expire_minutes: int = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))

        # CORS: an explicit allow-list instead of "*". Comma-separated origins.
        # Defaults cover the dockerised frontend (:8080) and the Vite dev
        # server (:5173).
        raw_origins = os.environ.get(
            "CORS_ALLOW_ORIGINS", "http://localhost:8080,http://localhost:5173"
        )
        self.cors_allow_origins: list[str] = [
            o.strip() for o in raw_origins.split(",") if o.strip()
        ]

        # QR query-site resolution (the '取得停車單資料' step).
        # - demo mode resolves the built-in QR-A1001... codes without a network
        #   call, so the app is demoable/testable out of the box.
        # - real URLs decoded from a QR are only fetched if their host is on
        #   this allow-list. Empty (the default) = real fetching is DISABLED, so
        #   the backend never fetches arbitrary QR-supplied URLs (SSRF safety).
        #   Set QR_QUERY_ALLOWED_HOSTS to the real query-site host to enable.
        self.qr_demo_mode: bool = _env_bool("QR_DEMO_MODE", True)
        raw_qr_hosts = os.environ.get("QR_QUERY_ALLOWED_HOSTS", "")
        self.qr_query_allowed_hosts: list[str] = [
            h.strip().lower() for h in raw_qr_hosts.split(",") if h.strip()
        ]
        self.qr_query_timeout: float = float(os.environ.get("QR_QUERY_TIMEOUT", "5"))
        # A local stand-in for the external query site, for end-to-end demoing
        # the real fetch path without a live government endpoint. Disable in prod.
        self.qr_mock_site_enabled: bool = _env_bool("QR_MOCK_SITE_ENABLED", True)

    @property
    def jwt_secret_is_default(self) -> bool:
        return self.jwt_secret == "dev-insecure-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()
