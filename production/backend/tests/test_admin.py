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


def test_stats_shape(client, manager_token):
    res = client.get("/api/admin/stats", headers=auth(manager_token))
    assert res.status_code == 200
    body = res.json()
    for key in (
        "total", "by_judgement", "by_status", "review_pending", "overdue_rate_pct",
        "by_day", "by_hour", "by_inspector", "time_diff_histogram", "map_points",
    ):
        assert key in body
    assert len(body["by_hour"]) == 24
    assert len(body["time_diff_histogram"]) == 6


def test_stats_map_points_from_gps(client, inspector_token, manager_token):
    client.post("/api/cases", headers=auth(inspector_token), json={
        "ticket_no": "Q7036002A121045", "district": "大安區", "road": "敦化南路", "spot_no": "C-1",
        "plate_no": "MAP-1", "amount": 900, "due_date": "2026-07-24",
        "parking_date": "2026-07-03", "parking_start": "2026-07-03T11:40:00",
        "parking_end": "2026-07-03T12:40:00", "data_source": "AUTO_QR",
        "gps_lat": 25.041, "gps_lng": 121.565, "inspector_username": "insp01",
    })
    body = client.get("/api/admin/stats", headers=auth(manager_token)).json()
    pts = [p for p in body["map_points"] if p["lat"] == 25.041 and p["lng"] == 121.565]
    assert pts and pts[0]["district"] == "大安區"


def test_csv_export_has_header_and_seeded_case(client, manager_token):
    res = client.get("/api/admin/export.csv", headers=auth(manager_token))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    text = res.text
    # New spreadsheet layout: first header row is the column names.
    first = text.lstrip("﻿").splitlines()[0]
    assert first.startswith("日期,檢查時間,調查員,")
    # The pre-seeded case (Q7028435D095253) appears split into barcode columns.
    assert "8435D" in text


def test_create_inspector_hides_password_and_can_login(client, sysadmin_token):
    res = client.post(
        "/api/admin/inspectors",
        headers=auth(sysadmin_token),
        json={"username": "insp99", "password": "newpass", "display_name": "測試員", "has_permission": True},
    )
    assert res.status_code == 200
    assert "password" not in res.json()  # never echo the credential back

    # The new account can actually authenticate.
    login = client.post("/api/login", json={"username": "insp99", "password": "newpass"})
    assert login.status_code == 200


def test_create_duplicate_inspector_conflicts(client, sysadmin_token):
    res = client.post(
        "/api/admin/inspectors",
        headers=auth(sysadmin_token),
        json={"username": "insp01", "password": "x", "display_name": "dup"},
    )
    assert res.status_code == 409


def test_update_inspector_password_rotates_credential(client, sysadmin_token):
    res = client.patch(
        "/api/admin/inspectors/insp01",
        headers=auth(sysadmin_token),
        json={"password": "rotated"},
    )
    assert res.status_code == 200
    # Old password no longer works; new one does.
    assert client.post("/api/login", json={"username": "insp01", "password": "pass123"}).status_code == 401
    assert client.post("/api/login", json={"username": "insp01", "password": "rotated"}).status_code == 200


def test_location_crud(client, sysadmin_token):
    created = client.post(
        "/api/admin/locations",
        headers=auth(sysadmin_token),
        json={"district": "信義區", "road": "松高路", "spot_no": "Z-001"},
    )
    assert created.status_code == 200
    loc_id = created.json()["id"]

    listed = client.get("/api/admin/locations", headers=auth(sysadmin_token)).json()
    assert any(r["id"] == loc_id for r in listed)

    deleted = client.delete(f"/api/admin/locations/{loc_id}", headers=auth(sysadmin_token))
    assert deleted.status_code == 200

    listed_after = client.get("/api/admin/locations", headers=auth(sysadmin_token)).json()
    assert not any(r["id"] == loc_id for r in listed_after)


def test_overdue_threshold_setting_changes_judgement(client, sysadmin_token, inspector_token):
    # Default 60-min threshold: the ~85-min case is OVERDUE.
    before = client.post("/api/cases/preview", headers=auth(inspector_token), json=OVERDUE_CASE_PREVIEW)
    assert before.json()["judgement"] == "OVERDUE"

    # Raise the threshold to 120 minutes...
    upd = client.put(
        "/api/admin/settings",
        headers=auth(sysadmin_token),
        json={"overdue_threshold_minutes": 120},
    )
    assert upd.status_code == 200

    # ...and the very same case now judges COMPLIANT.
    after = client.post("/api/cases/preview", headers=auth(inspector_token), json=OVERDUE_CASE_PREVIEW)
    assert after.json()["judgement"] == "COMPLIANT"


def test_settings_reject_non_positive_threshold(client, sysadmin_token):
    res = client.put(
        "/api/admin/settings",
        headers=auth(sysadmin_token),
        json={"overdue_threshold_minutes": 0},
    )
    assert res.status_code == 400
