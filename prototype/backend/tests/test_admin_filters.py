"""Admin case-list filters (inspector, date, district) and the OCR review flag."""
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


def test_filter_by_inspector(client, inspector_token, manager_token):
    _make_case(client, inspector_token)
    hit = client.get("/api/admin/cases?inspector=insp01", headers=auth(manager_token)).json()
    assert len(hit) >= 1 and all(c["inspector_username"] == "insp01" for c in hit)
    miss = client.get("/api/admin/cases?inspector=nobody", headers=auth(manager_token)).json()
    assert miss == []


def test_filter_by_district(client, inspector_token, manager_token):
    _make_case(client, inspector_token, district="大安區")
    hit = client.get("/api/admin/cases?district=大安區", headers=auth(manager_token)).json()
    assert len(hit) >= 1 and all(c["district"] == "大安區" for c in hit)
    assert client.get("/api/admin/cases?district=不存在區", headers=auth(manager_token)).json() == []


def test_filter_by_date(client, inspector_token, manager_token):
    case = _make_case(client, inspector_token)
    day = case["created_at"][:10]  # YYYY-MM-DD
    hit = client.get(f"/api/admin/cases?date={day}", headers=auth(manager_token)).json()
    assert any(c["id"] == case["id"] for c in hit)
    assert client.get("/api/admin/cases?date=1999-01-01", headers=auth(manager_token)).json() == []


def test_ocr_source_requires_review(client, inspector_token):
    body = _make_case(client, inspector_token, data_source="OCR")
    assert body["status"] == "REVIEW_REQUIRED"
    assert body["review_required"] == 1
