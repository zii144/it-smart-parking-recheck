"""Goal 1 - password storage. Unit-level checks on the hashing primitives and
a direct-DB assertion that no plaintext password is ever persisted.
"""
from __future__ import annotations

from sqlalchemy import select

from app.db import SessionLocal
from app.models import AdminUser, Inspector
from app.security import hash_password, verify_password


def test_hash_is_bcrypt_and_not_plaintext():
    hashed = hash_password("pass123")
    assert hashed != "pass123"
    assert hashed.startswith("$2b$")


def test_verify_password_roundtrip():
    hashed = hash_password("s3cr3t!")
    assert verify_password("s3cr3t!", hashed) is True
    assert verify_password("wrong", hashed) is False


def test_verify_rejects_malformed_hash():
    # e.g. a legacy plaintext value left in the column - must not match.
    assert verify_password("anything", "not-a-bcrypt-hash") is False
    assert verify_password("anything", "") is False


def test_long_password_is_accepted_deterministically():
    # bcrypt truncates at 72 bytes; hashing/verifying must not raise.
    pw = "x" * 200
    hashed = hash_password(pw)
    assert verify_password(pw, hashed) is True


def test_seeded_accounts_store_bcrypt_hashes(client):
    # client fixture seeds the DB; inspect the raw rows.
    db = SessionLocal()
    try:
        rows = list(db.scalars(select(Inspector))) + list(db.scalars(select(AdminUser)))
        assert rows, "expected seeded accounts"
        for row in rows:
            assert row.password.startswith("$2b$"), f"{row.username} not hashed"
            assert row.password not in ("pass123", "admin123")
    finally:
        db.close()
