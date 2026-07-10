"""Headless scrape worker for real 臺北市停車繳費通知單 QR codes.

The QR printed on a Taipei parking ticket encodes

    https://parkingfee.pma.gov.taipei/qr?tno=<單號>

That page is server-rendered with a summary block (車號 / 停車日期 / 停車時間 /
繳費期限 or 已繳金額) and then hands the browser to the payment portal at

    https://pay.taipei/qr/2/<單號>/<hash>/2  ->  /v2/Payment/QRToPayment

which renders the authoritative bill (帳單編號 / 應繳金額 / 帳單總金額 and a
明細 panel repeating 車號/停車日期/停車時間). The portal is session-based, so
hop 2 reuses the cookie jar from hop 1's redirect chain.

`scrape()` runs both hops headlessly over plain HTTP (no browser needed - both
pages are server-rendered), merges the fields, and returns a ticket dict in the
same shape the demo QR codes produce, plus a `web_info` provenance block for
the UI. Hop 2 failing is non-fatal: hop 1 alone already yields a usable ticket.

Safety: every hop (including each redirect target) is pinned to an explicit
host allow-list, https only, with response-size caps - a scanned QR can steer
us only between the two known government hosts.

NOTE 行政區/停車地點/車位編號 are printed on the paper ticket but are NOT
published anywhere in this fee-query chain, so they cannot be scraped; the
inspector still picks the location (the app pre-suggests 行政區 from GPS).
"""
from __future__ import annotations

import functools
import logging
import re
import ssl
from pathlib import Path
from urllib.parse import urljoin, urlparse, parse_qs

import certifi
import httpx

logger = logging.getLogger("parking.qr.taipei")

# The gov sites chain to the Mozilla-trusted "TWCA Global Root CA" via the
# "TWCA Secure SSL Certification Authority" intermediate, but that intermediate
# omits a Subject Key Identifier, which trips modern OpenSSL's chain checks
# (curl/browsers accept it via the OS trust store). We bundle that legitimate
# intermediate alongside certifi's roots so verification succeeds WITHOUT
# disabling it. Combined with the host allow-list, the trust surface stays
# limited to the two known government hosts.
_INTERMEDIATE_PEM = Path(__file__).with_name("certs") / "twca_intermediate.pem"


@functools.lru_cache(maxsize=1)
def _ssl_context() -> ssl.SSLContext:
    ca = certifi.contents()
    try:
        ca += "\n" + _INTERMEDIATE_PEM.read_text()
    except OSError:
        logger.warning("TWCA intermediate PEM missing (%s); using certifi only", _INTERMEDIATE_PEM)
    return ssl.create_default_context(cadata=ca)

QR_HOST = "parkingfee.pma.gov.taipei"
PAY_HOST = "pay.taipei"

_MAX_BODY_BYTES = 512 * 1024
_MAX_REDIRECTS = 4

_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
)

# 單號 as printed/encoded: "Q" + 14 alphanumerics.
_TNO_RE = re.compile(r"^Q[0-9A-Z]{14}$")

_PAY_LINK_RE = re.compile(r"https://pay\.taipei/qr/[A-Za-z0-9/._-]+")
_ROC_DATE_RE = re.compile(r"(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日")
_SLASH_DATE_RE = re.compile(r"(\d{4})/(\d{1,2})/(\d{1,2})")
_TIME_RANGE_RE = re.compile(r"(\d{1,2}:\d{2}(?::\d{2})?)\s*[~～]\s*(\d{1,2}:\d{2}(?::\d{2})?)")


def matches(url: str) -> str | None:
    """If `url` is a Taipei parking-ticket QR link, return its 單號 (tno)."""
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme != "https" or (parsed.hostname or "").lower() != QR_HOST:
        return None
    if parsed.path.rstrip("/") != "/qr":
        return None
    tno = (parse_qs(parsed.query).get("tno") or [""])[0].strip().upper()
    return tno if _TNO_RE.match(tno) else None


# --------------------------------------------------------------------------
# HTTP plumbing (single seam for tests)
# --------------------------------------------------------------------------
def _fetch(client: httpx.Client, url: str, timeout: float) -> httpx.Response:
    """One GET, no redirects. Module-level so tests can substitute it."""
    return client.get(url, timeout=timeout, follow_redirects=False)


def _get_pinned(client: httpx.Client, url: str, allowed_hosts: set[str], timeout: float) -> httpx.Response | None:
    """GET `url`, manually following redirects while pinning every hop's host
    to `allowed_hosts` (https only). Returns the final 2xx response, or None."""
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        parsed = urlparse(current)
        if parsed.scheme != "https" or (parsed.hostname or "").lower() not in allowed_hosts:
            logger.warning("taipei scrape: refusing off-allowlist hop %s", current.split("?")[0])
            return None
        response = _fetch(client, current, timeout)
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("location")
            if not location:
                return None
            current = urljoin(current, location)
            continue
        if 200 <= response.status_code < 300 and len(response.content) <= _MAX_BODY_BYTES:
            return response
        return None
    return None


# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------
def _roc_to_iso(text: str) -> str | None:
    m = _ROC_DATE_RE.search(text)
    if not m:
        return None
    year = int(m.group(1)) + 1911
    return f"{year:04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _slash_to_iso(text: str) -> str | None:
    m = _SLASH_DATE_RE.search(text)
    if not m:
        return None
    return f"{int(m.group(1)):04d}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


def _pad_time(value: str) -> str:
    parts = value.strip().split(":")
    if len(parts) == 2:
        parts.append("00")
    return ":".join(p.zfill(2) for p in parts)


def _strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "\n", html)


def _find(pattern: str, text: str) -> str | None:
    m = re.search(pattern, text)
    return m.group(1).strip() if m else None


def _parse_summary_page(html: str) -> dict:
    """Hop 1: the parkingfee.pma.gov.taipei summary. Full-width spaces appear
    inside labels (車　　號), so label regexes allow whitespace between chars."""
    text = _strip_tags(html)
    out: dict = {}

    plate = _find(r"車\s*號\s*[：:]\s*([A-Z0-9]+(?:-[A-Z0-9]+)+|[A-Z0-9]{2,}-?[A-Z0-9]*)", text)
    if plate:
        out["plate_no"] = plate.strip()

    date_line = _find(r"停車日期\s*[：:]\s*([^\n]+)", text)
    if date_line:
        iso = _roc_to_iso(date_line) or _slash_to_iso(date_line)
        if iso:
            out["parking_date"] = iso

    time_line = _find(r"停車時間\s*[：:]\s*([^\n]+)", text)
    if time_line:
        m = _TIME_RANGE_RE.search(time_line)
        if m:
            out["time_start"], out["time_end"] = _pad_time(m.group(1)), _pad_time(m.group(2))

    due_line = _find(r"繳費期限\s*[：:]\s*([^\n]+)", text)
    if due_line:
        iso = _roc_to_iso(due_line) or _slash_to_iso(due_line)
        if iso:
            out["due_date"] = iso

    rate = _find(r"費率\s*[：:]\s*([^\n]+)", text)
    if rate:
        out["rate"] = rate.strip()

    paid_amount = _find(r"已繳金額\s*[：:]\s*(\d+)", text)
    if paid_amount:
        out["paid_amount"] = int(paid_amount)

    discounted = _find(r"優惠後金額\s*[：:]\s*(\d+)", text)
    if discounted:
        out["discounted_amount"] = int(discounted)

    pay_link = _PAY_LINK_RE.search(html)
    if pay_link:
        out["pay_url"] = pay_link.group(0)

    return out


def _parse_pay_page(html: str) -> dict:
    """Hop 2: the pay.taipei bill page. The bill row uses data-title attrs;
    the collapsed 明細 panel repeats 車號/停車日期/停車時間."""
    out: dict = {}

    row = {
        label: value.strip()
        for label, value in re.findall(
            r'data-title="([^"：]+)[^"]*"\s*>\s*([^<]+)<', html
        )
    }
    due = row.get("繳費期限")
    if due:
        iso = _slash_to_iso(due) or _roc_to_iso(due)
        if iso:
            out["due_date"] = iso
    bill_no = row.get("帳單編號")
    if bill_no and _TNO_RE.match(bill_no.strip().upper()):
        out["bill_no"] = bill_no.strip().upper()
    amount_due = row.get("應繳金額")
    if amount_due:
        digits = re.sub(r"[^\d]", "", amount_due)
        if digits:
            out["bill_total"] = int(digits)

    text = _strip_tags(html)
    if "bill_total" not in out:
        total = _find(r"帳單總金額\s*\n?\s*(\d+)", text)
        if total:
            out["bill_total"] = int(total)

    discounted = _find(r'id="TotalAmt"[^>]*value="(\d+)"', html)
    if discounted:
        out["discounted_amount"] = int(discounted)

    plate = _find(r"車\s*號\s*[：:]\s*([A-Z0-9-]+)", text)
    if plate:
        out["plate_no"] = plate.strip()
    date_line = _find(r"停車日期\s*[：:]\s*([^\n]+)", text)
    if date_line:
        iso = _slash_to_iso(date_line) or _roc_to_iso(date_line)
        if iso:
            out["parking_date"] = iso
    time_line = _find(r"停車時間\s*[：:]\s*([^\n]+)", text)
    if time_line:
        m = _TIME_RANGE_RE.search(time_line)
        if m:
            out["time_start"], out["time_end"] = _pad_time(m.group(1)), _pad_time(m.group(2))

    return out


# --------------------------------------------------------------------------
# The worker
# --------------------------------------------------------------------------
def scrape(url: str, timeout: float) -> tuple[dict | None, str | None]:
    """Run the two-hop fetch for a ticket QR URL.

    Returns (result, page_preview):
      result       - {"ticket": {...}, "web_info": {...}} on success, else None
      page_preview - hop-1 text (for the manual-transcription fallback) when
                     we reached the page but couldn't parse a usable ticket
    """
    tno = matches(url)
    if not tno:
        return None, None

    headers = {"User-Agent": _USER_AGENT, "Accept-Language": "zh-TW,zh;q=0.9"}
    preview: str | None = None
    try:
        with httpx.Client(headers=headers, verify=_ssl_context()) as client:
            hop1 = _get_pinned(client, url, {QR_HOST}, timeout)
            if hop1 is None:
                return None, None
            summary = _parse_summary_page(hop1.text)
            preview = _strip_tags(hop1.text)
            preview = re.sub(r"\n{2,}", "\n", preview).strip()[:2000]

            detail: dict = {}
            pay_url = summary.get("pay_url")
            if pay_url:
                hop2 = _get_pinned(client, pay_url, {PAY_HOST}, timeout)
                if hop2 is not None:
                    detail = _parse_pay_page(hop2.text)
                else:
                    logger.info("taipei scrape: pay.taipei hop failed for %s, using summary only", tno)
    except Exception as exc:  # network error, timeout, DNS, TLS, ...
        logger.info("taipei scrape failed for %s: %s", tno, exc)
        return None, preview

    merged = {**summary, **{k: v for k, v in detail.items() if v not in (None, "")}}

    plate = merged.get("plate_no")
    parking_date = merged.get("parking_date")
    if not plate or not parking_date or not merged.get("time_start"):
        # Reached the page but couldn't parse the essentials.
        return None, preview

    # Bill amount: the authoritative 帳單總金額 when hop 2 delivered it,
    # otherwise what hop 1 shows (已繳金額 for paid bills, discounted otherwise).
    paid = "paid_amount" in merged and "due_date" not in summary
    amount = merged.get("bill_total")
    amount_is_discounted = False
    if amount is None:
        amount = merged.get("paid_amount")
    if amount is None and merged.get("discounted_amount") is not None:
        amount = merged.get("discounted_amount")
        amount_is_discounted = True

    ticket = {
        "ticket_no": tno,
        "plate_no": plate,
        "parking_date": parking_date,
        "parking_start": f"{parking_date}T{merged['time_start']}",
        "parking_end": f"{parking_date}T{merged['time_end']}" if merged.get("time_end") else None,
        "due_date": merged.get("due_date"),
        "amount": amount,
    }
    web_info = {
        "source_host": QR_HOST,
        "final_host": PAY_HOST if detail else None,
        "bill_no": tno,
        "paid": paid,
        "rate": merged.get("rate"),
        "bill_total": merged.get("bill_total"),
        "discounted_amount": merged.get("discounted_amount"),
        "amount_is_discounted": amount_is_discounted,
    }
    return {"ticket": ticket, "web_info": web_info}, preview
