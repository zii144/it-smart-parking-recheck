"""Taipei 停車繳費通知單 QR chain: URL matching, two-hop scrape, field parsing.

Fixtures are trimmed copies of the real pages fetched from the sample tickets
in target-sample/ (parkingfee.pma.gov.taipei summary in both paid/unpaid
variants + the pay.taipei bill page), so the parsers are exercised against the
actual markup the government sites serve.
"""
from __future__ import annotations

import httpx
import pytest

from app import qr_service, taipei_parkingfee
from app.config import get_settings

QR_URL = "https://parkingfee.pma.gov.taipei/qr?tno=Q7078443D090047"
PAY_URL = "https://pay.taipei/qr/2/Q7078443D090047/bafb/2"

# --- trimmed real fixtures --------------------------------------------------
SUMMARY_UNPAID = """
<html><body>
<div class="card-box" id="formCard"><div class="row">
<t class="PayTit">車　　號：CAP-6198 </t><t class="PayTit">停車日期：115 年 7 月 7 日</t>
<t class="PayTit">停車時間：09:00:00~11:29:00</t>
<t class="PayTit">繳費期限：115 年 7 月 22 日</t>
</div></div>
<p style="color:yellow;font-size:25px">智慧支付優惠後金額:48</p>
<script>$(function () { if(1==1){ location.href="https://pay.taipei/qr/2/Q7078443D090047/bafb/2"; } });</script>
</body></html>
"""

SUMMARY_PAID = """
<html><body>
<div class="card-box"><div class="row">
<t class="PayTit">車　　號：BBN-0710 </t><t class="PayTit">停車日期：115 年 7 月 8 日</t>
<t class="PayTit">停車時間：09:23:35~10:53:35</t>
<t class="PayTit">費率:小自客 計時20</t>
<t class="PayTit">已繳金額:30</t>
</div></div>
<a href="https://pay.taipei/qr/2/Q70885062951261/3a08/2">前往</a>
</body></html>
"""

PAY_PAGE = """
<html><body>
<form action="/v2/Payment/QRPay" id="actionForm" method="post">
<ul class="dataList">
<li class="w-25" data-title="繳費期限 ：">2026/07/22</li>
<li class="w-30" data-title="帳單編號 ：">Q7078443D090047</li>
<li class="w-25" data-title="應繳金額 ：">50元</li>
</ul>
<div class="panel-collapse collapse" id="collapse0">
<dl class="detailData">
<dd><label>車號：</label>CAP-6198</dd>
<dd><label>停車日期：</label>2026/07/07</dd>
<dd><label>停車時間：</label>09:00:00~11:29:00</dd>
</dl></div>
<span class="price_Tit">帳單總金額</span><span class="text1">50</span>
<input type="hidden" id="TotalAmt" name="TotalAmt" value="48">
</form>
</body></html>
"""


def _fake_fetch(pages: dict[str, httpx.Response]):
    """Replace the single HTTP seam with a URL-keyed table."""

    def _fetch(client, url, timeout):
        base = url.split("?")[0]
        for key, resp in pages.items():
            if url.startswith(key) or base.startswith(key):
                return resp
        raise httpx.ConnectError(f"unexpected URL in test: {url}")

    return _fetch


def _resp(text: str, status: int = 200) -> httpx.Response:
    return httpx.Response(status, text=text, headers={"content-type": "text/html"})


def _allow_taipei(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(
        s, "qr_query_allowed_hosts", ["parkingfee.pma.gov.taipei", "pay.taipei"]
    )
    monkeypatch.setattr(qr_service, "_resolves_to_public_ip", lambda h: True)


# --- URL matching -----------------------------------------------------------
def test_matches_extracts_tno():
    assert taipei_parkingfee.matches(QR_URL) == "Q7078443D090047"


@pytest.mark.parametrize("url", [
    "https://evil.example/qr?tno=Q7078443D090047",         # wrong host
    "http://parkingfee.pma.gov.taipei/qr?tno=Q7078443D090047",  # not https
    "https://parkingfee.pma.gov.taipei/other?tno=Q7078443D090047",  # wrong path
    "https://parkingfee.pma.gov.taipei/qr?tno=short",       # bad tno
])
def test_matches_rejects(url):
    assert taipei_parkingfee.matches(url) is None


# --- full chain through qr_service ------------------------------------------
def test_unpaid_ticket_scrapes_both_hops(monkeypatch):
    _allow_taipei(monkeypatch)
    monkeypatch.setattr(taipei_parkingfee, "_fetch", _fake_fetch({
        "https://parkingfee.pma.gov.taipei/qr": _resp(SUMMARY_UNPAID),
        "https://pay.taipei/": _resp(PAY_PAGE),
    }))

    res = qr_service.resolve(QR_URL)
    assert res["status"] == "success"
    t = res["ticket"]
    assert t["ticket_no"] == "Q7078443D090047"
    assert t["plate_no"] == "CAP-6198"
    assert t["parking_date"] == "2026-07-07"          # 115 年 -> 2026
    assert t["parking_start"] == "2026-07-07T09:00:00"
    assert t["parking_end"] == "2026-07-07T11:29:00"
    assert t["due_date"] == "2026-07-22"
    assert t["amount"] == 50                          # 帳單總金額, not the discounted 48
    w = res["web_info"]
    assert w["paid"] is False and w["final_host"] == "pay.taipei"
    assert w["bill_total"] == 50 and w["discounted_amount"] == 48


def test_paid_ticket_summary_only(monkeypatch):
    _allow_taipei(monkeypatch)
    url = "https://parkingfee.pma.gov.taipei/qr?tno=Q70885062951261"
    # pay.taipei down -> hop 1 alone must still produce a ticket
    monkeypatch.setattr(taipei_parkingfee, "_fetch", _fake_fetch({
        "https://parkingfee.pma.gov.taipei/qr": _resp(SUMMARY_PAID),
        "https://pay.taipei/": _resp("oops", status=500),
    }))

    res = qr_service.resolve(url)
    assert res["status"] == "success"
    t = res["ticket"]
    assert t["plate_no"] == "BBN-0710"
    assert t["parking_date"] == "2026-07-08"
    assert t["parking_start"] == "2026-07-08T09:23:35"
    assert t["due_date"] is None                      # paid bills show no deadline
    assert t["amount"] == 30                          # 已繳金額
    w = res["web_info"]
    assert w["paid"] is True and w["rate"] == "小自客 計時20"
    assert w["final_host"] is None


def test_unreachable_site_falls_back_to_fetch_failed(monkeypatch):
    _allow_taipei(monkeypatch)

    def _boom(client, url, timeout):
        raise httpx.ConnectTimeout("no route")

    monkeypatch.setattr(taipei_parkingfee, "_fetch", _boom)
    res = qr_service.resolve(QR_URL)
    assert res["status"] == "fetch_failed"
    assert res["query_url"] == QR_URL


def test_unparseable_page_returns_preview_for_manual_entry(monkeypatch):
    _allow_taipei(monkeypatch)
    monkeypatch.setattr(taipei_parkingfee, "_fetch", _fake_fetch({
        "https://parkingfee.pma.gov.taipei/qr": _resp("<html><body>系統維護中</body></html>"),
    }))
    res = qr_service.resolve(QR_URL)
    assert res["status"] == "fetch_failed"
    assert "系統維護中" in (res["page_preview"] or "")


def test_redirect_off_allowlist_is_refused(monkeypatch):
    _allow_taipei(monkeypatch)
    # Summary page whose pay link tries to bounce through pay.taipei to elsewhere:
    # the pinned redirect loop must refuse the off-host hop, ticket still parses.
    redirecting = httpx.Response(
        302, headers={"location": "https://attacker.example/steal"}
    )
    monkeypatch.setattr(taipei_parkingfee, "_fetch", _fake_fetch({
        "https://parkingfee.pma.gov.taipei/qr": _resp(SUMMARY_UNPAID),
        "https://pay.taipei/": redirecting,
    }))
    res = qr_service.resolve(QR_URL)
    assert res["status"] == "success"                 # summary alone suffices
    assert res["web_info"]["final_host"] is None      # hop 2 never completed
    assert res["ticket"]["amount"] == 48              # falls back to discounted
    assert res["web_info"]["amount_is_discounted"] is True


def test_scan_endpoint_returns_web_info(client, inspector_token, monkeypatch):
    _allow_taipei(monkeypatch)
    monkeypatch.setattr(taipei_parkingfee, "_fetch", _fake_fetch({
        "https://parkingfee.pma.gov.taipei/qr": _resp(SUMMARY_UNPAID),
        "https://pay.taipei/": _resp(PAY_PAGE),
    }))
    from tests.conftest import auth

    res = client.post("/api/qr/scan", headers=auth(inspector_token), json={"qr_code": QR_URL})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "success"
    assert body["ticket"]["plate_no"] == "CAP-6198"
    assert body["web_info"]["bill_no"] == "Q7078443D090047"
