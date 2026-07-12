"""Case save/preview flows, including the auth-hardening behaviours: the
stored inspector is taken from the token, and listing is caller-scoped.
"""
from __future__ import annotations

from tests.conftest import auth


def _clean_case_payload(**overrides):
    # QR-A1004: issue time 12:10:45 vs parking start 11:40 -> COMPLIANT.
    payload = {
        "ticket_no": "Q7036002A121045",
        "district": "大安區",
        "road": "敦化南路",
        "spot_no": "C-101",
        "plate_no": "GHI-3456",
        "amount": 900,
        "due_date": "2026-07-24",
        "parking_date": "2026-07-03",
        "parking_start": "2026-07-03T11:40:00",
        "parking_end": "2026-07-03T12:40:00",
        "data_source": "AUTO_QR",
        "inspector_username": "insp01",
    }
    payload.update(overrides)
    return payload


def test_preview_compliant(client, inspector_token):
    res = client.post(
        "/api/cases/preview",
        headers=auth(inspector_token),
        json={
            "ticket_no": "Q7036002A121045",
            "parking_date": "2026-07-03",
            "parking_start": "2026-07-03T11:40:00",
        },
    )
    assert res.status_code == 200
    assert res.json()["judgement"] == "COMPLIANT"


def test_save_clean_case_is_closed(client, inspector_token):
    res = client.post("/api/cases", headers=auth(inspector_token), json=_clean_case_payload())
    assert res.status_code == 200
    body = res.json()
    assert body["judgement"] == "COMPLIANT"
    assert body["status"] == "CLOSED"


def test_saved_inspector_comes_from_token_not_payload(client, inspector_token):
    # Spoof the username in the body; server must ignore it and use the token.
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_clean_case_payload(inspector_username="SOMEONE_ELSE"),
    )
    assert res.status_code == 200
    assert res.json()["inspector_username"] == "insp01"


def test_gps_coordinates_are_stored(client, inspector_token):
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_clean_case_payload(gps_lat=25.03746, gps_lng=121.56498),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["gps_lat"] == 25.03746
    assert body["gps_lng"] == 121.56498


def test_gps_is_optional(client, inspector_token):
    # A case saved without GPS (permission denied) still stores, coords null.
    res = client.post("/api/cases", headers=auth(inspector_token), json=_clean_case_payload())
    assert res.status_code == 200
    body = res.json()
    assert body["gps_lat"] is None
    assert body["gps_lng"] is None


def test_overdue_case_requires_review(client, inspector_token):
    # QR-A1002: issue 10:15:30 vs start 08:50 -> ~85 min -> OVERDUE.
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_clean_case_payload(
            ticket_no="Q7029001B101530",
            parking_date="2026-07-02",
            parking_start="2026-07-02T08:50:00",
            parking_end="2026-07-02T09:50:00",
        ),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["judgement"] == "OVERDUE"
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["review_required"] == 1


def test_duplicate_ticket_conflicts(client, inspector_token):
    # Q7028435D095253 is pre-seeded, so re-saving it should 409.
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_clean_case_payload(ticket_no="Q7028435D095253"),
    )
    assert res.status_code == 409
    assert res.json()["detail"]["duplicate"] is True


def test_duplicate_save_anyway_succeeds_with_warning(client, inspector_token):
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_clean_case_payload(ticket_no="Q7028435D095253", save_anyway=True),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["duplicate_warning"] == 1
    assert body["status"] == "REVIEW_REQUIRED"


def test_listing_is_scoped_to_caller(client, inspector_token, sysadmin_token):
    # insp01 saves a case...
    client.post("/api/cases", headers=auth(inspector_token), json=_clean_case_payload())

    mine = client.get("/api/cases", headers=auth(inspector_token)).json()
    assert any(c["ticket_no"] == "Q7036002A121045" for c in mine)

    # ...a different (permitted) inspector must not see it. Create one via the
    # sysadmin API — insp02 is seeded without inspection permission, so it's
    # blocked from the inspector API entirely and can't stand in here.
    client.post(
        "/api/admin/inspectors",
        headers=auth(sysadmin_token),
        json={"username": "insp99", "password": "pass123", "display_name": "另一位稽查員"},
    )
    other_token = client.post(
        "/api/login", json={"username": "insp99", "password": "pass123"}
    ).json()["token"]
    other_cases = client.get("/api/cases", headers=auth(other_token)).json()
    assert other_cases == []  # brand-new inspector sees none of insp01's cases
    assert not any(c["ticket_no"] == "Q7036002A121045" for c in other_cases)
