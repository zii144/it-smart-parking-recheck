"""QR resolution: demo codes, real fetch+parse, and the SSRF guard."""
from __future__ import annotations

import httpx
import pytest

from app import qr_service
from app.config import get_settings
from tests.conftest import auth

JSON_TICKET = (
    '{"ticket_no": "Q7036002A121045", "plate_no": "GHI-3456", "amount": 900,'
    ' "due_date": "2026-07-24", "parking_date": "2026-07-03",'
    ' "parking_start": "2026-07-03T11:40:00", "parking_end": "2026-07-03T12:40:00"}'
)

HTML_TICKET = (
    "<html><body>"
    "<p>帳單編號：Q7036002A121045</p>"
    "<p>車牌號碼：GHI-3456</p>"
    "<p>應繳金額：900</p>"
    "<p>繳費期限：2026-07-24</p>"
    "<p>停車日期：2026-07-03</p>"
    "<p>停車開始時間：11:40</p>"  # time-only -> should be combined with the date
    "<p>停車結束時間：12:40</p>"
    "</body></html>"
)


def _enable_real_fetch(monkeypatch, host="qr.example.gov.tw"):
    s = get_settings()
    monkeypatch.setattr(s, "qr_query_allowed_hosts", [host])
    # Trust the allow-listed host without a real DNS lookup in tests.
    monkeypatch.setattr(qr_service, "_resolves_to_public_ip", lambda h: True)
    return host


def _fake_fetch(text, *, status=200, content_type="text/html; charset=utf-8"):
    def _fetch(url, timeout):
        return httpx.Response(status, text=text, headers={"content-type": content_type})

    return _fetch


# --- demo path ------------------------------------------------------------
def test_demo_success_code():
    res = qr_service.resolve("QR-A1004")
    assert res["status"] == "success"
    assert res["ticket"]["ticket_no"] == "Q7036002A121045"
    # Internal metadata must not leak into the ticket payload.
    assert "type" not in res["ticket"] and "note" not in res["ticket"]


def test_demo_fetch_failed_code():
    res = qr_service.resolve("QR-A1005")
    assert res["status"] == "fetch_failed"
    assert res["query_url"]
    assert "帳單編號" in res["page_preview"]


def test_unknown_code_is_scan_failed():
    assert qr_service.resolve("QR-DOES-NOT-EXIST")["status"] == "scan_failed"


def test_empty_content_is_scan_failed():
    assert qr_service.resolve("")["status"] == "scan_failed"


# --- real URL path --------------------------------------------------------
def test_real_fetch_disabled_by_default_does_not_hit_network(monkeypatch):
    # Empty allow-list (default) -> URL must be rejected before any fetch.
    def _boom(url, timeout):
        raise AssertionError("fetch_url must not be called when host not allow-listed")

    monkeypatch.setattr(qr_service, "fetch_url", _boom)
    assert qr_service.resolve("https://qr.example.gov.tw/t/abc")["status"] == "scan_failed"


def test_real_fetch_json(monkeypatch):
    host = _enable_real_fetch(monkeypatch)
    monkeypatch.setattr(
        qr_service, "fetch_url", _fake_fetch(JSON_TICKET, content_type="application/json")
    )
    res = qr_service.resolve(f"https://{host}/t/abc")
    assert res["status"] == "success"
    assert res["ticket"]["ticket_no"] == "Q7036002A121045"
    assert res["ticket"]["amount"] == 900.0


def test_real_fetch_labeled_html_combines_time(monkeypatch):
    host = _enable_real_fetch(monkeypatch)
    monkeypatch.setattr(qr_service, "fetch_url", _fake_fetch(HTML_TICKET))
    res = qr_service.resolve(f"https://{host}/t/abc")
    assert res["status"] == "success"
    # Time-only "11:40" + date -> ISO datetime the judgement step expects.
    assert res["ticket"]["parking_start"] == "2026-07-03T11:40:00"
    assert res["ticket"]["parking_end"] == "2026-07-03T12:40:00"


def test_real_fetch_unparseable_page_is_fetch_failed(monkeypatch):
    host = _enable_real_fetch(monkeypatch)
    monkeypatch.setattr(qr_service, "fetch_url", _fake_fetch("<html>maintenance</html>"))
    res = qr_service.resolve(f"https://{host}/t/abc")
    assert res["status"] == "fetch_failed"
    assert res["query_url"] == f"https://{host}/t/abc"


def test_fetch_exception_is_fetch_failed(monkeypatch):
    host = _enable_real_fetch(monkeypatch)

    def _raise(url, timeout):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(qr_service, "fetch_url", _raise)
    assert qr_service.resolve(f"https://{host}/t/abc")["status"] == "fetch_failed"


def test_http_error_status_is_fetch_failed(monkeypatch):
    host = _enable_real_fetch(monkeypatch)
    monkeypatch.setattr(qr_service, "fetch_url", _fake_fetch("not found", status=404))
    assert qr_service.resolve(f"https://{host}/t/abc")["status"] == "fetch_failed"


# --- SSRF guard -----------------------------------------------------------
def test_non_allowlisted_host_rejected(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "qr_query_allowed_hosts", ["qr.example.gov.tw"])
    assert qr_service._is_allowed_url("https://evil.example.com/x", ["qr.example.gov.tw"]) is False


def test_non_http_scheme_rejected():
    assert qr_service._is_allowed_url("file:///etc/passwd", ["localhost"]) is False
    assert qr_service._is_allowed_url("ftp://host/x", ["host"]) is False


def test_empty_allowlist_rejects_everything():
    assert qr_service._is_allowed_url("https://anything.com/x", []) is False


def test_dns_rebinding_to_private_ip_rejected(monkeypatch):
    # Host is allow-listed but resolves to a private address -> reject.
    monkeypatch.setattr(qr_service, "_resolves_to_public_ip", lambda h: False)
    assert qr_service._is_allowed_url("https://qr.example.gov.tw/x", ["qr.example.gov.tw"]) is False


def test_allowlisted_localhost_permitted():
    # The dev mock-site case: loopback is allowed only when explicitly listed.
    assert qr_service._is_allowed_url("http://localhost:8000/mock-qr-site/A1004", ["localhost"]) is True


# --- endpoint + mock site -------------------------------------------------
def test_scan_endpoint_requires_auth(client):
    assert client.post("/api/qr/scan", json={"qr_code": "QR-A1004"}).status_code == 401


def test_scan_endpoint_demo(client, inspector_token):
    res = client.post("/api/qr/scan", headers=auth(inspector_token), json={"qr_code": "QR-A1004"})
    assert res.status_code == 200
    assert res.json()["status"] == "success"


def test_scan_endpoint_real_url(client, inspector_token, monkeypatch):
    host = _enable_real_fetch(monkeypatch)
    monkeypatch.setattr(
        qr_service, "fetch_url", _fake_fetch(JSON_TICKET, content_type="application/json")
    )
    res = client.post(
        "/api/qr/scan", headers=auth(inspector_token), json={"qr_code": f"https://{host}/t/abc"}
    )
    assert res.status_code == 200
    assert res.json()["ticket"]["ticket_no"] == "Q7036002A121045"


def test_mock_site_serves_ticket_page(client):
    res = client.get("/mock-qr-site/A1004")
    assert res.status_code == 200
    assert "帳單編號" in res.text
    assert "Q7036002A121045" in res.text


def test_mock_site_unknown_token_404(client):
    assert client.get("/mock-qr-site/NOPE").status_code == 404
