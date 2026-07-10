"""Admin (管理人員) editing and deleting case records."""
from __future__ import annotations

from tests.conftest import auth


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


def test_manager_can_edit_case_field(client, inspector_token, manager_token):
    case = _make_case(client, inspector_token)
    res = client.patch(
        f"/api/admin/cases/{case['id']}",
        headers=auth(manager_token),
        json={"plate_no": "XYZ-9999"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["plate_no"] == "XYZ-9999"


def test_edit_rejudges_when_time_fields_change(client, inspector_token, manager_token):
    case = _make_case(client, inspector_token)  # COMPLIANT
    # Push the parking start far earlier so the issue time is now overdue.
    res = client.patch(
        f"/api/admin/cases/{case['id']}",
        headers=auth(manager_token),
        json={"parking_start": "2026-07-03T09:00:00"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["judgement"] == "OVERDUE"


def test_edit_to_duplicate_ticket_is_rejected(client, inspector_token, manager_token):
    a = _make_case(client, inspector_token, ticket_no="Q7036002A121045")
    b = _make_case(client, inspector_token, ticket_no="Q7040003B131500",
                   parking_date="2026-07-04", parking_start="2026-07-04T13:00:00")
    res = client.patch(
        f"/api/admin/cases/{b['id']}",
        headers=auth(manager_token),
        json={"ticket_no": a["ticket_no"]},
    )
    assert res.status_code == 409


def test_manager_can_delete_case(client, inspector_token, manager_token):
    case = _make_case(client, inspector_token)
    res = client.delete(f"/api/admin/cases/{case['id']}", headers=auth(manager_token))
    assert res.status_code == 200
    assert res.json()["ok"] is True
    # Gone now.
    assert client.get(f"/api/admin/cases/{case['id']}", headers=auth(manager_token)).status_code == 404


def test_edit_and_delete_require_manager_role(client, inspector_token, sysadmin_token):
    case = _make_case(client, inspector_token)
    assert client.patch(f"/api/admin/cases/{case['id']}", headers=auth(sysadmin_token),
                        json={"plate_no": "NO"}).status_code == 403
    assert client.delete(f"/api/admin/cases/{case['id']}", headers=auth(sysadmin_token)).status_code == 403


def test_edit_missing_case_404(client, manager_token):
    assert client.patch("/api/admin/cases/99999", headers=auth(manager_token),
                        json={"plate_no": "X"}).status_code == 404
