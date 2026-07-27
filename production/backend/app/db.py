"""SQLAlchemy engine/session wiring plus a couple of small settings helpers.

Schema management now lives in Alembic (see backend/alembic/), not here - the
old hand-rolled CREATE TABLE / ALTER TABLE migration code is gone. Tables are
created by `alembic upgrade head` (run on container start and by run.sh).
`init_db()` is kept as a thin dev-only fallback that creates tables directly
from the models when you're running against a throwaway SQLite file without
invoking Alembic.
"""
from __future__ import annotations

import logging
from collections.abc import Iterator

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateColumn

from .config import get_settings
from .models import Base, Setting

logger = logging.getLogger("parking.db")

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
    _add_missing_columns()


def _add_missing_columns() -> None:
    """create_all creates missing *tables* but never ALTERs existing ones, so a
    dev database created before a model gained a column keeps the old shape and
    the first query touching the new column dies with "no such column" - which
    the UI then reports as a misleading connection error. Bring the live schema
    up to the models by adding whatever columns are missing; each is rendered
    with its server_default, matching what the corresponding Alembic migration
    does in real deployments. (Dropped/renamed/retyped columns still need a
    real migration or `./dev.sh reset-db` - additive drift is by far the common
    case, and the only one that can be healed safely in place.)
    """
    with engine.begin() as conn:
        inspector = inspect(conn)
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {col["name"] for col in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl = CreateColumn(column).compile(dialect=conn.dialect)
                conn.exec_driver_sql(f'ALTER TABLE "{table.name}" ADD COLUMN {ddl}')
                logger.warning(
                    "dev schema drift healed: added column %s.%s", table.name, column.name
                )


def get_setting(db: Session, key: str, default: str | None = None) -> str | None:
    row = db.get(Setting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value
