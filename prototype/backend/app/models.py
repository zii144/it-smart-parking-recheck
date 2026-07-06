"""SQLAlchemy ORM models.

These mirror the original hand-written SQLite schema one-to-one so the wire
format of the API is unchanged: date/time fields stay ISO strings (TEXT) and
the boolean-ish flags stay 0/1 integers, exactly as the frontend already
expects. The only real change is that `password` columns now hold a bcrypt
hash instead of plaintext.

The same models drive both SQLite (local/tests) and PostgreSQL (deployment)
via SQLAlchemy's dialect abstraction, and are the single source of truth that
Alembic autogenerates migrations from.
"""
from __future__ import annotations

from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Inspector(Base):
    __tablename__ = "inspectors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)  # bcrypt hash
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    has_permission: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(String(255), nullable=False)  # bcrypt hash
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    district: Mapped[str] = mapped_column(String(64), nullable=False)
    road: Mapped[str] = mapped_column(String(128), nullable=False)
    spot_no: Mapped[str] = mapped_column(String(64), nullable=False)


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_no: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    district: Mapped[str | None] = mapped_column(String(64))
    road: Mapped[str | None] = mapped_column(String(128))
    spot_no: Mapped[str | None] = mapped_column(String(64))
    plate_no: Mapped[str | None] = mapped_column(String(32))
    amount: Mapped[float | None] = mapped_column(Float)
    due_date: Mapped[str | None] = mapped_column(String(32))
    parking_date: Mapped[str | None] = mapped_column(String(32))
    parking_start: Mapped[str | None] = mapped_column(String(32))
    parking_end: Mapped[str | None] = mapped_column(String(32))
    # AUTO_QR | MANUAL_FROM_QR_PAGE | MANUAL_FROM_TICKET
    data_source: Mapped[str] = mapped_column(String(32), nullable=False)
    manual_corrected: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    original_values: Mapped[str | None] = mapped_column(Text)  # JSON snapshot
    inspector_username: Mapped[str | None] = mapped_column(String(64))
    issue_datetime: Mapped[str | None] = mapped_column(String(32))
    time_diff_minutes: Mapped[float | None] = mapped_column(Float)
    # COMPLIANT | OVERDUE | DATA_ERROR | PARSE_ERROR
    judgement: Mapped[str | None] = mapped_column(String(32))
    review_required: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_warning: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    photo_path: Mapped[str | None] = mapped_column(String(255))
    # REVIEW_REQUIRED | REVIEW_NEED_INFO | CLOSED
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    synced_offline: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # DATA_ERROR | DUPLICATE | NEED_INFO | CONFIRMED | DISMISSED
    review_outcome: Mapped[str | None] = mapped_column(String(32))
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(64))
    reviewed_at: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[str] = mapped_column(String(32), nullable=False)


def row_to_dict(obj: Base) -> dict:
    """Serialize an ORM row to a plain dict of its columns.

    Mirrors the old `dict(sqlite3.Row)` behaviour the endpoints relied on, so
    JSON responses keep the exact same shape (including the 0/1 int flags).
    """
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
