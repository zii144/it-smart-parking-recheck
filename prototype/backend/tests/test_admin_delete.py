"""Admin delete endpoints: permissions, guard rails, and missing-resource paths."""
from __future__ import annotations

from tests.conftest import auth


def _create_inspector(client, sysadmin_token, username="insp99"):
    res = client.post(
        "/api/admin/inspectors",
        headers=auth(sysadmin_token),
        json={
            "username": username,
            "password": "newpass",
            "display_name": "可刪除測試員",
            "has_permission": True,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()


def _create_location(client, sysadmin_token, spot_no="DEL-001"):
    res = client.post(
        "/api/admin/locations",
        headers=auth(sysadmin_token),
        json={"district": "信義區", "road": "松高路", "spot_no": spot_no},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _make_case(client, inspector_token, **overrides):
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
    res = client.post("/api/cases", headers=auth(inspector_token), json=payload)
    assert res.status_code == 200, res.text
    return res.json()


# --- inspector delete -------------------------------------------------------
def test_delete_inspector_without_cases(client, sysadmin_token):
    _create_inspector(client, sysadmin_token)
    res = client.delete("/api/admin/inspectors/insp99", headers=auth(sysadmin_token))
    assert res.status_code == 200
    rows = client.get("/api/admin/inspectors", headers=auth(sysadmin_token)).json()
    assert not any(r["username"] == "insp99" for r in rows)


def test_cannot_delete_inspector_with_cases(client, sysadmin_token):
    res = client.delete("/api/admin/inspectors/insp01", headers=auth(sysadmin_token))
    assert res.status_code == 400
    assert "案件" in res.json()["detail"]


def test_delete_inspector_requires_sysadmin(client, manager_token):
    res = client.delete("/api/admin/inspectors/insp02", headers=auth(manager_token))
    assert res.status_code == 403


def test_delete_missing_inspector_404(client, sysadmin_token):
    res = client.delete("/api/admin/inspectors/ghost", headers=auth(sysadmin_token))
    assert res.status_code == 404


# --- location delete --------------------------------------------------------
def test_delete_location_without_cases(client, sysadmin_token):
    loc = _create_location(client, sysadmin_token)
    res = client.delete(f"/api/admin/locations/{loc['id']}", headers=auth(sysadmin_token))
    assert res.status_code == 200


def test_cannot_delete_location_with_cases(client, sysadmin_token, inspector_token):
    loc = _create_location(client, sysadmin_token, spot_no="CASE-BOUND")
    _make_case(
        client,
        inspector_token,
        district=loc["district"],
        road=loc["road"],
        spot_no=loc["spot_no"],
        ticket_no="Q7040003B131500",
        parking_date="2026-07-04",
        parking_start="2026-07-04T13:00:00",
    )
    res = client.delete(f"/api/admin/locations/{loc['id']}", headers=auth(sysadmin_token))
    assert res.status_code == 400
    assert "案件" in res.json()["detail"]


def test_delete_location_requires_sysadmin(client, sysadmin_token, manager_token):
    loc = _create_location(client, sysadmin_token, spot_no="ROLE-001")
    res = client.delete(f"/api/admin/locations/{loc['id']}", headers=auth(manager_token))
    assert res.status_code == 403


def test_delete_missing_location_404(client, sysadmin_token):
    res = client.delete("/api/admin/locations/99999", headers=auth(sysadmin_token))
    assert res.status_code == 404


# --- case delete ------------------------------------------------------------
def test_delete_missing_case_404(client, manager_token):
    res = client.delete("/api/admin/cases/99999", headers=auth(manager_token))
    assert res.status_code == 404


def test_delete_second_sysadmin_succeeds(client, sysadmin_token):
    client.post(
        "/api/admin/admins",
        headers=auth(sysadmin_token),
        json={
            "username": "sys2",
            "password": "second-sysadmin",
            "display_name": "副管理員",
            "role": "sysadmin",
        },
    )
    res = client.delete("/api/admin/admins/sys2", headers=auth(sysadmin_token))
    assert res.status_code == 200
