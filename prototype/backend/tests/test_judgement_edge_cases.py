"""Judgement must degrade gracefully — never 500 — on ticket/time inputs that
parse but can't be turned into a real datetime (regression for the two crash
paths in _run_judgement)."""
from __future__ import annotations

from tests.conftest import auth

# Q + month=2 + day=30 + code + time. Passes parse_ticket_no (month 1-12, day
# 1-31) but datetime(year, 2, 30) is an impossible calendar date.
IMPOSSIBLE_DATE_TICKET = "Q2308435D095253"


def _preview(client, token, **overrides):
    payload = {
        "ticket_no": IMPOSSIBLE_DATE_TICKET,
        "parking_date": "2026-07-02",
        "parking_start": "2026-07-02T09:10:00",
    }
    payload.update(overrides)
    return client.post("/api/cases/preview", headers=auth(token), json=payload)


def test_preview_impossible_calendar_date_is_parse_error_not_500(client, inspector_token):
    res = _preview(client, inspector_token)
    assert res.status_code == 200, res.text
    assert res.json()["judgement"] == "PARSE_ERROR"


def test_preview_tz_aware_parking_start_does_not_500(client, inspector_token):
    # A timezone-aware parking_start used to raise TypeError (can't subtract
    # aware from naive) -> 500. It should now be handled: tz stripped, judged.
    res = _preview(
        client,
        inspector_token,
        ticket_no="Q7028435D095253",
        parking_start="2026-07-02T09:10:00+08:00",
    )
    assert res.status_code == 200, res.text
    assert res.json()["judgement"] in ("COMPLIANT", "OVERDUE", "DATA_ERROR")


def test_save_impossible_date_persists_as_parse_error_for_review(client, inspector_token):
    payload = {
        "ticket_no": IMPOSSIBLE_DATE_TICKET,
        "district": "大安區",
        "road": "敦化南路",
        "spot_no": "C-101",
        "plate_no": "GHI-3456",
        "amount": 900,
        "due_date": "2026-07-24",
        "parking_date": "2026-07-02",
        "parking_start": "2026-07-02T09:10:00",
        "parking_end": "2026-07-02T10:10:00",
        "data_source": "AUTO_QR",
        "inspector_username": "insp01",
    }
    res = client.post("/api/cases", headers=auth(inspector_token), json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["judgement"] == "PARSE_ERROR"
    # PARSE_ERROR is review-worthy, so it must land in the review queue.
    assert body["status"] == "REVIEW_REQUIRED"
