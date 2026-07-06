"""SQLAlchemy engine/session wiring plus a couple of small settings helpers.

Schema management now lives in Alembic (see backend/alembic/), not here - the
old hand-rolled CREATE TABLE / ALTER TABLE migration code is gone. Tables are
created by `alembic upgrade head` (run on container start and by run.sh).
`init_db()` is kept as a thin dev-only fallback that creates tables directly
from the models when you're running against a throwaway SQLite file without
invoking Alembic.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .models import Base, Setting

settings = get_settings()

# SQLite needs check_same_thread=False for FastAPI's threadpool; Postgres and
# others take no special connect args.
_connect_args = (
    {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
)

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Dev-only convenience: create all tables directly from the models.

    Production uses Alembic migrations instead; this exists so tests / quick
    local SQLite runs don't require an alembic invocation.
    """
    Base.metadata.create_all(bind=engine)


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.get(Setting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value
