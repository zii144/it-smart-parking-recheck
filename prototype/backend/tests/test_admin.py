"""Admin-console API: CRUD, CSV export, and the settings->judgement rule that
proves the overdue threshold is a real end-to-end configurable parameter.
"""
from __future__ import annotations

from tests.conftest import auth

OVERDUE_CASE_PREVIEW = {
    "ticket_no": "Q7029001B101530",  # issue 10:15:30
    "parking_date": "2026-07-02",
    "parking_start": "2026-07-02T08:50:00",  # ~85 min gap
}


def test_stats_shape(client, admin_token):
    res = client.get("/api/admin/stats", headers=auth(admin_token))
    assert res.status_code == 200
    body = res.json()
    for key in ("total", "by_judgement", "by_status", "review_pending", "overdue_rate_pct"):
        assert key in body


def test_csv_export_has_header_and_seeded_case(client, admin_token):
    res = client.get("/api/admin/export.csv", headers=auth(admin_token))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.text
    assert text.splitlines()[0].startswith("id,ticket_no,")
    assert "Q7028435D095253" in text  # the pre-seeded case


def test_create_inspector_hides_password_and_can_login(client, admin_token):
    res = client.post(
        "/api/admin/inspectors",
        headers=auth(admin_token),
        json={"username": "insp99", "password": "newpass", "display_name": "測試員", "has_permission": True},
    )
    assert res.status_code == 200
    assert "password" not in res.json()  # never echo the credential back

    # The new account can actually authenticate.
    login = client.post("/api/login", json={"username": "insp99", "password": "newpass"})
    assert login.status_code == 200


def test_create_duplicate_inspector_conflicts(client, admin_token):
    res = client.post(
        "/api/admin/inspectors",
        headers=auth(admin_token),
        json={"username": "insp01", "password": "x", "display_name": "dup"},
    )
    assert res.status_code == 409


def test_update_inspector_password_rotates_credential(client, admin_token):
    res = client.patch(
        "/api/admin/inspectors/insp01",
        headers=auth(admin_token),
        json={"password": "rotated"},
    )
    assert res.status_code == 200
    # Old password no longer works; new one does.
    assert client.post("/api/login", json={"username": "insp01", "password": "pass123"}).status_code == 401
    assert client.post("/api/login", json={"username": "insp01", "password": "rotated"}).status_code == 200


def test_location_crud(client, admin_token):
    created = client.post(
        "/api/admin/locations",
        headers=auth(admin_token),
        json={"district": "信義區", "road": "松高路", "spot_no": "Z-001"},
    )
    assert created.status_code == 200
    loc_id = created.json()["id"]

    listed = client.get("/api/admin/locations", headers=auth(admin_token)).json()
    assert any(r["id"] == loc_id for r in listed)

    deleted = client.delete(f"/api/admin/locations/{loc_id}", headers=auth(admin_token))
    assert deleted.status_code == 200

    listed_after = client.get("/api/admin/locations", headers=auth(admin_token)).json()
    assert not any(r["id"] == loc_id for r in listed_after)


def test_overdue_threshold_setting_changes_judgement(client, admin_token, inspector_token):
    # Default 60-min threshold: the ~85-min case is OVERDUE.
    before = client.post("/api/cases/preview", headers=auth(inspector_token), json=OVERDUE_CASE_PREVIEW)
    assert before.json()["judgement"] == "OVERDUE"

    # Raise the threshold to 120 minutes...
    upd = client.put(
        "/api/admin/settings",
        headers=auth(admin_token),
        json={"overdue_threshold_minutes": 120},
    )
    assert upd.status_code == 200

    # ...and the very same case now judges COMPLIANT.
    after = client.post("/api/cases/preview", headers=auth(inspector_token), json=OVERDUE_CASE_PREVIEW)
    assert after.json()["judgement"] == "COMPLIANT"


def test_settings_reject_non_positive_threshold(client, admin_token):
    res = client.put(
        "/api/admin/settings",
        headers=auth(admin_token),
        json={"overdue_threshold_minutes": 0},
    )
    assert res.status_code == 400
