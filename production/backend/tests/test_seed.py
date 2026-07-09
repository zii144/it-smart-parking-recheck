"""Seed behaviour, especially the production SEED_DEMO_DATA=false path.

Production must never get the known-credential demo accounts, but it still
needs default system settings (e.g. the overdue threshold) to function.
"""
from __future__ import annotations

from sqlalchemy import func, select

from app.db import SessionLocal, get_setting, init_db
from app.models import AdminUser, Base, Inspector
from app.seed import seed


def _fresh_schema():
    from app.db import engine

    Base.metadata.drop_all(bind=engine)
    init_db()


def test_seed_without_demo_creates_no_accounts_but_keeps_settings():
    _fresh_schema()
    seed(force=True, demo=False)
    db = SessionLocal()
    try:
        assert db.scalar(select(func.count()).select_from(Inspector)) == 0
        assert db.scalar(select(func.count()).select_from(AdminUser)) == 0
        # Default settings must still exist so judgement works out of the box.
        assert get_setting(db, "overdue_threshold_minutes") is not None
    finally:
        db.close()


def test_seed_with_demo_creates_accounts():
    _fresh_schema()
    seed(force=True, demo=True)
    db = SessionLocal()
    try:
        assert db.scalar(select(func.count()).select_from(Inspector)) > 0
        assert db.scalar(select(func.count()).select_from(AdminUser)) > 0
    finally:
        db.close()
