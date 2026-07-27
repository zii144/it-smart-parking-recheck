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


_DEV_JWT_SECRET = "dev-insecure-change-me"

# Obvious placeholder secrets that must never reach production. Compared
# case-insensitively; the minimum-length check in check_runtime_safety catches
# the long tail of weak values these don't enumerate.
_KNOWN_WEAK_JWT_SECRETS = {
    _DEV_JWT_SECRET,
    "please-change-me-before-deploying",
    "change-me",
    "changeme",
    "secret",
    "test-secret",
    # The exact placeholder shipped in backend/.env.example. It's 33 chars, so
    # the length check alone would let it through — enumerate it explicitly so a
    # blind `cp .env.example .env` can't deploy a publicly-known signing key.
    "change-me-to-a-long-random-string",
}
# Substrings that betray an un-substituted placeholder even when it's long
# enough to pass the length gate (e.g. "your-super-secret-change-me-please").
# Matched case-insensitively anywhere in the secret.
_WEAK_JWT_SECRET_SUBSTRINGS = (
    "change",
    "changeme",
    "placeholder",
    "example",
    "your-secret",
    "replace-me",
    "todo",
)
_MIN_JWT_SECRET_LEN = 16


class Settings:
    def __init__(self) -> None:
        # Deployment environment. Production tightens safety checks (see
        # check_runtime_safety) that only warn in development.
        self.app_env: str = os.environ.get("APP_ENV", "development").strip().lower()
        _is_prod = self.app_env in ("production", "prod")

        self.database_url: str = os.environ.get("DATABASE_URL", _default_database_url())

        self.uploads_dir: Path = Path(
            os.environ.get("PARKING_UPLOADS_DIR", str(BASE_DIR / "uploads"))
        )

        # Uploaded photo cap (Blocker 5): decoded bytes above this are rejected
        # with 413 before anything is written to disk.
        self.max_upload_bytes: int = int(
            os.environ.get("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024))
        )

        # Login throttling (Blocker 4): after `login_max_attempts` failures
        # within `login_window_seconds`, that username/IP is locked out for
        # `login_lockout_seconds`.
        self.login_max_attempts: int = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
        self.login_window_seconds: int = int(os.environ.get("LOGIN_WINDOW_SECONDS", "300"))
        self.login_lockout_seconds: int = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "300"))

        # JWT signing. HS256 with a shared secret. The dev default is clearly
        # insecure; in production the app refuses to boot unless JWT_SECRET is
        # set to a strong value (see check_runtime_safety).
        self.jwt_secret: str = os.environ.get("JWT_SECRET", _DEV_JWT_SECRET)
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
        #   this allow-list. The default covers the real Taipei ticket chain
        #   (parkingfee.pma.gov.taipei QR page -> pay.taipei bill portal); the
        #   scrape worker additionally pins every redirect hop to these hosts.
        #   Set QR_QUERY_ALLOWED_HOSTS="" to disable real fetching entirely.
        self.qr_demo_mode: bool = _env_bool("QR_DEMO_MODE", True)
        raw_qr_hosts = os.environ.get(
            "QR_QUERY_ALLOWED_HOSTS", "parkingfee.pma.gov.taipei,pay.taipei"
        )
        self.qr_query_allowed_hosts: list[str] = [
            h.strip().lower() for h in raw_qr_hosts.split(",") if h.strip()
        ]
        self.qr_query_timeout: float = float(os.environ.get("QR_QUERY_TIMEOUT", "5"))
        # A local stand-in for the external query site, for end-to-end demoing
        # the real fetch path without a live government endpoint. Force-disabled
        # in production so the unauthenticated /mock-qr-site endpoint can never
        # be left exposed on a real deploy, regardless of the env flag.
        self.qr_mock_site_requested: bool = _env_bool("QR_MOCK_SITE_ENABLED", True)
        self.qr_mock_site_enabled: bool = self.qr_mock_site_requested and not _is_prod

        # Seed demo accounts / locations / sample case on startup. On for local
        # dev & the prototype. In production this is force-disabled here (not
        # merely defaulted off) so no known-credential demo account — e.g. the
        # seeded sysadmin — can ever be created on a real deployment, even if a
        # compose file or env var mistakenly requests it. Default system
        # settings are seeded regardless of this flag.
        self.seed_demo_requested: bool = _env_bool("SEED_DEMO_DATA", True)
        self.seed_demo_data: bool = self.seed_demo_requested and not _is_prod

        # Minimum password length enforced when the admin console creates or
        # updates an *admin* account (managers/sysadmins). Kept off the inspector
        # endpoints so existing field-worker credentials aren't invalidated.
        self.admin_password_min_length: int = int(
            os.environ.get("ADMIN_PASSWORD_MIN_LENGTH", "8")
        )

        # Bootstrap sysadmin. Because production runs with SEED_DEMO_DATA=false,
        # no admin account exists on a fresh deploy and there'd be no way to log
        # into the console. If these are set, the first sysadmin is created from
        # the environment (idempotently, only when that username is absent) — no
        # hard-coded credential ever lives in the source tree.
        self.bootstrap_admin_username: str = os.environ.get(
            "BOOTSTRAP_ADMIN_USERNAME", ""
        ).strip()
        self.bootstrap_admin_password: str = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "")
        self.bootstrap_admin_display_name: str = os.environ.get(
            "BOOTSTRAP_ADMIN_DISPLAY_NAME", "系統管理員"
        ).strip()

    @property
    def is_production(self) -> bool:
        return self.app_env in ("production", "prod")

    @property
    def jwt_secret_is_default(self) -> bool:
        return self.jwt_secret == _DEV_JWT_SECRET

    @property
    def jwt_secret_is_weak(self) -> bool:
        """True if the signing secret is a known placeholder or too short.

        Beyond the exact-match list and the length gate, reject any secret that
        still contains an obvious placeholder marker ("change", "example", …) —
        those long-but-unsubstituted values would otherwise sail past the
        length check and ship a guessable key.
        """
        secret = (self.jwt_secret or "").strip()
        lowered = secret.lower()
        if lowered in _KNOWN_WEAK_JWT_SECRETS or len(secret) < _MIN_JWT_SECRET_LEN:
            return True
        return any(marker in lowered for marker in _WEAK_JWT_SECRET_SUBSTRINGS)

    def check_runtime_safety(self) -> None:
        """Fail-fast on insecure production configuration (Blocker 3).

        Raised at startup (from the app lifespan) so a misconfigured
        deployment refuses to boot rather than silently running with a
        guessable token-signing secret. In development this is a no-op; the
        caller logs a warning instead.
        """
        if self.is_production and self.jwt_secret_is_weak:
            raise RuntimeError(
                "Refusing to start in production with a weak or default JWT_SECRET. "
                f"Set JWT_SECRET to a strong random value of at least "
                f"{_MIN_JWT_SECRET_LEN} characters (APP_ENV=production)."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
