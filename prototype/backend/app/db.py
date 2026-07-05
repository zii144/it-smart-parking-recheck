"""Thin SQLite data-access layer. Plain sqlite3 is used on purpose to keep
the prototype dependency-light and easy to read end to end."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

# Overridable via env var (handy for tests / running against a scratch dir);
# defaults to a file next to the backend package.
DB_PATH = Path(os.environ.get("PARKING_DB_PATH", str(Path(__file__).resolve().parent.parent / "parking.db")))

SCHEMA = """
CREATE TABLE IF NOT EXISTS inspectors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    has_permission INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    district TEXT NOT NULL,
    road TEXT NOT NULL,
    spot_no TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_no TEXT NOT NULL,
    district TEXT,
    road TEXT,
    spot_no TEXT,
    plate_no TEXT,
    amount REAL,
    due_date TEXT,
    parking_date TEXT,
    parking_start TEXT,
    parking_end TEXT,
    data_source TEXT NOT NULL,          -- AUTO_QR | MANUAL_FROM_QR_PAGE | MANUAL_FROM_TICKET
    manual_corrected INTEGER NOT NULL DEFAULT 0,
    original_values TEXT,               -- JSON snapshot of pre-correction values, if any
    inspector_username TEXT,
    issue_datetime TEXT,
    time_diff_minutes REAL,
    judgement TEXT,                     -- COMPLIANT | OVERDUE | DATA_ERROR | PARSE_ERROR
    review_required INTEGER NOT NULL DEFAULT 0,
    duplicate_warning INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT,
    status TEXT NOT NULL,               -- REVIEW_REQUIRED | REVIEW_NEED_INFO | CLOSED
    synced_offline INTEGER NOT NULL DEFAULT 0,
    review_outcome TEXT,                -- DATA_ERROR | DUPLICATE | NEED_INFO | CONFIRMED | DISMISSED
    review_note TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
);
"""

# Columns added after the initial release. Kept as an explicit migration list
# (rather than just relying on CREATE TABLE IF NOT EXISTS, which does nothing
# for a table that already exists) so an existing parking.db from an earlier
# version of the prototype still works after pulling the admin-console update.
CASES_MIGRATION_COLUMNS = {
    "review_outcome": "TEXT",
    "review_note": "TEXT",
    "reviewed_by": "TEXT",
    "reviewed_at": "TEXT",
}


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, ddl_type in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}")


def init_db() -> None:
    conn = get_connection()
    try:
        conn.executescript(SCHEMA)
        _ensure_columns(conn, "cases", CASES_MIGRATION_COLUMNS)
        conn.commit()
    finally:
        conn.close()


def find_case_by_ticket_no(conn: sqlite3.Connection, ticket_no: str) -> sqlite3.Row | None:
    cur = conn.execute(
        "SELECT * FROM cases WHERE ticket_no = ? ORDER BY id LIMIT 1", (ticket_no,)
    )
    return cur.fetchone()


def get_setting(conn: sqlite3.Connection, key: str, default: str | None = None) -> str | None:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
