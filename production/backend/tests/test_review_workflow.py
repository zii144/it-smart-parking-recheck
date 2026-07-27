"""The manager review workflow: POST /api/admin/cases/{id}/review transitions,
reviewer-identity guarantee, and re-review-on-edit (H2)."""
from __future__ import annotations

from tests.conftest import auth


def _make_overdue_case(client, inspector_token):
    """QR-A1002 data: issue 10:15:30 vs parking start 08:50 -> ~85 min OVERDUE,
    so the case is created REVIEW_REQUIRED."""
    payload = {
        "ticket_no": "Q7029001B101530",
        "district": "大安區",
        "road": "敦化南路",
        "spot_no": "C-101",
        "plate_no": "XYZ-5678",
        "amount": 1200,
        "due_date": "2026-07-23",
        "parking_date": "2026-07-02",
        "parking_start": "2026-07-02T08:50:00",
        "parking_end": "2026-07-02T09:50:00",
        "data_source": "AUTO_QR",
        "inspector_username": "insp01",
    }
    res = client.post("/api/cases", headers=auth(inspector_token), json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["judgement"] == "OVERDUE"
    assert body["status"] == "REVIEW_REQUIRED"
    return body


def _make_compliant_case(client, inspector_token):
    payload = {
        "ticket_no": "Q7036002A121045",
        "district": "松山區",
        "road": "民生東路4段80巷",
        "spot_no": "05",
        "plate_no": "GHI-3456",
        "amount": 900,
        "due_date": "2026-07-24",
        "parking_date": "2026-07-03",
        "parking_start": "2026-07-03T11:40:00",
        "parking_end": "2026-07-03T12:40:00",
        "data_source": "AUTO_QR",
        "inspector_username": "insp01",
    }
    res = client.post("/api/cases", headers=auth(inspector_token), json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["judgement"] == "COMPLIANT"
    assert body["status"] == "CLOSED"
    return body


def test_confirmed_closes_case_and_records_token_reviewer(client, inspector_token, manager_token):
    case = _make_overdue_case(client, inspector_token)
    res = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        # Reviewer name in the body is deliberately wrong — the server must use
        # the authenticated identity, not this.
        json={"outcome": "CONFIRMED", "note": "確認違規", "reviewed_by": "someone-else"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "CLOSED"
    assert body["review_outcome"] == "CONFIRMED"
    assert body["review_note"] == "確認違規"
    assert body["reviewed_by"] == "manager01"  # from the token, not the payload
    assert body["reviewed_at"] is not None


def test_need_info_keeps_case_open(client, inspector_token, manager_token):
    case = _make_overdue_case(client, inspector_token)
    res = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        json={"outcome": "NEED_INFO", "reviewed_by": "manager01"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "REVIEW_NEED_INFO"
    # A NEED_INFO case is still in the queue, so it can be reviewed again.
    again = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        json={"outcome": "DISMISSED", "reviewed_by": "manager01"},
    )
    assert again.status_code == 200, again.text
    assert again.json()["status"] == "CLOSED"


def test_reviewing_a_closed_case_is_rejected(client, inspector_token, manager_token):
    case = _make_overdue_case(client, inspector_token)
    client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        json={"outcome": "CONFIRMED", "reviewed_by": "manager01"},
    )
    # Now CLOSED — a second review must be rejected (not in the queue).
    res = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        json={"outcome": "DISMISSED", "reviewed_by": "manager01"},
    )
    assert res.status_code == 400


def test_unknown_outcome_rejected(client, inspector_token, manager_token):
    case = _make_overdue_case(client, inspector_token)
    res = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(manager_token),
        json={"outcome": "MADE_UP", "reviewed_by": "manager01"},
    )
    assert res.status_code == 400


def test_review_missing_case_404(client, manager_token):
    res = client.post(
        "/api/admin/cases/99999/review",
        headers=auth(manager_token),
        json={"outcome": "CONFIRMED", "reviewed_by": "manager01"},
    )
    assert res.status_code == 404


def test_review_requires_manager_role(client, inspector_token, sysadmin_token):
    case = _make_overdue_case(client, inspector_token)
    res = client.post(
        f"/api/admin/cases/{case['id']}/review",
        headers=auth(sysadmin_token),
        json={"outcome": "CONFIRMED", "reviewed_by": "x"},
    )
    assert res.status_code == 403


def test_edit_reopens_closed_case_when_it_becomes_overdue(client, inspector_token, manager_token):
    """H2: a CLOSED/COMPLIANT case edited so it now judges OVERDUE must
    re-enter the review queue, not silently stay closed."""
    case = _make_compliant_case(client, inspector_token)  # CLOSED
    res = client.patch(
        f"/api/admin/cases/{case['id']}",
        headers=auth(manager_token),
        json={"parking_start": "2026-07-03T09:00:00"},  # now ~190 min overdue
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["judgement"] == "OVERDUE"
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["review_required"] == 1
