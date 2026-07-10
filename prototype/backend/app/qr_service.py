"""QR query-site resolution - the design's '取得停車單資料' / `A->>Q` step.

A parking-ticket QR encodes a URL pointing at an external '查詢網站' (query
page). Scanning it yields that URL; the backend fetches the page and parses the
ticket fields (帳單編號/車號/金額/期限/停車時間) out of it.

`resolve(qr_content)` returns one of the shapes the frontend already expects:

    {"status": "success", "ticket": {...}}                    # fetched + parsed
    {"status": "fetch_failed", "query_url": ..., "page_preview": ...}
    {"status": "scan_failed"}

Two resolution paths:

  1. Demo codes (QR-A1001 ...) - resolved from the built-in QR_DEMO_CODES table
     with no network call when QR_DEMO_MODE is on. Keeps the app demoable and
     the camera flow testable without a live site.

  2. Real URLs - fetched over HTTP and parsed. Because the URL comes from an
     untrusted scanned code, fetching is gated by a strict host allow-list plus
     scheme/redirect checks (see `_is_allowed_url`) to prevent SSRF. Real
     fetching is OFF by default (empty allow-list); operators opt in via
     QR_QUERY_ALLOWED_HOSTS once the real query-site host is known.
"""
from __future__ import annotations

import ipaddress
import json
import logging
import re
import socket
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from . import taipei_parkingfee
from .config import get_settings
from .seed import QR_DEMO_CODES

logger = logging.getLogger("parking.qr")

# Fields we try to extract from a query page, and the zh-TW labels the page
# uses for each (for the human-readable / HTML variant of the response).
TEXT_LABELS: dict[str, str] = {
    "ticket_no": "帳單編號",
    "plate_no": "車牌號碼",
    "amount": "應繳金額",
    "due_date": "繳費期限",
    "parking_date": "停車日期",
    "parking_start": "停車開始時間",
    "parking_end": "停車結束時間",
}

# Minimum fields required to treat a fetch as a usable ticket. Without these the
# downstream judgement can't run, so we report fetch_failed and let the
# inspector transcribe from the page preview instead.
REQUIRED_FIELDS = ("ticket_no", "parking_date", "parking_start")

_MAX_PREVIEW_CHARS = 2000


@dataclass
class Resolution:
    status: str  # "success" | "fetch_failed" | "scan_failed"
    ticket: dict | None = None
    query_url: str | None = None
    page_preview: str | None = None
    web_info: dict | None = None  # provenance block for web-scraped tickets

    def to_response(self) -> dict:
        if self.status == "success":
            out = {"status": "success", "ticket": self.ticket}
            if self.web_info:
                out["web_info"] = self.web_info
            return out
        if self.status == "fetch_failed":
            return {
                "status": "fetch_failed",
                "query_url": self.query_url,
                "page_preview": self.page_preview,
            }
        return {"status": "scan_failed"}


# --------------------------------------------------------------------------
# Public entry point
# --------------------------------------------------------------------------
def resolve(qr_content: str) -> dict:
    settings = get_settings()
    content = (qr_content or "").strip()
    if not content:
        return Resolution("scan_failed").to_response()

    # 1) Demo codes: exact match against the built-in table.
    if settings.qr_demo_mode and content in QR_DEMO_CODES:
        return _resolve_demo(content).to_response()

    # 2) Real URL: only if it looks like a URL.
    if _looks_like_url(content):
        return _resolve_url(content, settings).to_response()

    # Anything else is an unusable / unrecognised QR.
    return Resolution("scan_failed").to_response()


# --------------------------------------------------------------------------
# Demo path
# --------------------------------------------------------------------------
def _resolve_demo(code: str) -> Resolution:
    entry = QR_DEMO_CODES[code]
    if entry["type"] == "success":
        ticket = {k: v for k, v in entry.items() if k not in ("type", "note")}
        return Resolution("success", ticket=ticket)
    if entry["type"] == "fetch_failed":
        return Resolution(
            "fetch_failed",
            query_url=entry["query_url"],
            page_preview=entry["page_preview"],
        )
    return Resolution("scan_failed")


# --------------------------------------------------------------------------
# Real URL path
# --------------------------------------------------------------------------
def _resolve_url(url: str, settings) -> Resolution:
    if not _is_allowed_url(url, settings.qr_query_allowed_hosts):
        # Rejected before any network call (SSRF guard / not enabled).
        logger.warning("QR URL rejected by allow-list: %s", _safe_log_url(url))
        return Resolution("scan_failed")

    # Real 臺北市停車繳費通知單 QR -> dedicated two-hop scrape worker
    # (parkingfee.pma.gov.taipei summary + pay.taipei bill detail).
    if taipei_parkingfee.matches(url):
        result, preview = taipei_parkingfee.scrape(url, settings.qr_query_timeout)
        if result is not None:
            return Resolution("success", ticket=result["ticket"], web_info=result["web_info"])
        # Reached but unparseable -> hand the inspector the page text to
        # transcribe; unreachable -> plain fetch_failed.
        return Resolution("fetch_failed", query_url=url, page_preview=preview)

    try:
        response = fetch_url(url, settings.qr_query_timeout)
    except Exception as exc:  # network error, timeout, DNS, TLS, ...
        logger.info("QR query fetch failed for %s: %s", _safe_log_url(url), exc)
        return Resolution("fetch_failed", query_url=url, page_preview=None)

    body = response.text or ""
    if response.status_code >= 400:
        return Resolution("fetch_failed", query_url=url, page_preview=body[:_MAX_PREVIEW_CHARS])

    ticket = _parse_ticket(body, response.headers.get("content-type", ""))
    if ticket is None:
        # Decoded fine, page reachable, but we couldn't extract a ticket.
        return Resolution("fetch_failed", query_url=url, page_preview=body[:_MAX_PREVIEW_CHARS])

    return Resolution("success", ticket=ticket)


def fetch_url(url: str, timeout: float) -> httpx.Response:
    """Fetch the query page. Redirects are NOT followed - a redirect could
    bounce an allow-listed host to an internal one, defeating the SSRF guard.
    Kept as a module-level function so tests can substitute it."""
    return httpx.get(url, timeout=timeout, follow_redirects=False)


# --------------------------------------------------------------------------
# URL safety (SSRF guard)
# --------------------------------------------------------------------------
def _looks_like_url(content: str) -> bool:
    return content.lower().startswith(("http://", "https://"))


def _is_allowed_url(url: str, allowed_hosts: list[str]) -> bool:
    """Only allow http(s) URLs whose host is explicitly allow-listed and does
    not resolve to a private/loopback/reserved address.

    An empty allow-list means real fetching is disabled entirely - the safe
    default, so a scanned QR can never make the backend fetch an arbitrary URL.
    """
    if not allowed_hosts:
        return False

    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in ("http", "https"):
        return False

    host = (parsed.hostname or "").lower()
    if not host or host not in allowed_hosts:
        return False

    # Defence-in-depth against DNS rebinding: reject if the host resolves to a
    # non-public address (unless it's a loopback host an operator deliberately
    # allow-listed, e.g. the local mock site in dev).
    if not _resolves_to_public_ip(host) and host not in ("localhost", "127.0.0.1", "::1"):
        return False

    return True


def _resolves_to_public_ip(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            return False
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def _safe_log_url(url: str) -> str:
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.hostname or '?'}{parsed.path or ''}"


# --------------------------------------------------------------------------
# Parsing
# --------------------------------------------------------------------------
def _parse_ticket(body: str, content_type: str) -> dict | None:
    """Extract ticket fields from a query-page response.

    Supports two realistic formats: a JSON payload (API-style query site) and a
    labeled text/HTML page (the '查詢頁' the design describes). Returns None if
    the required fields can't be found.
    """
    data: dict = {}

    # JSON first, if it parses and looks like a field map.
    parsed_json = None
    if "json" in content_type.lower():
        try:
            parsed_json = json.loads(body)
        except ValueError:
            parsed_json = None
    if parsed_json is None:
        # Some sites send JSON without the header; try opportunistically.
        stripped = body.strip()
        if stripped[:1] in ("{", "["):
            try:
                parsed_json = json.loads(stripped)
            except ValueError:
                parsed_json = None

    if isinstance(parsed_json, dict):
        for field in TEXT_LABELS:
            if field in parsed_json and parsed_json[field] not in (None, ""):
                data[field] = parsed_json[field]
    else:
        # Labeled text / HTML. Strip tags so labels inside markup still match.
        text = re.sub(r"<[^>]+>", "\n", body)
        for field, label in TEXT_LABELS.items():
            m = re.search(rf"{re.escape(label)}\s*[：:]\s*(.+)", text)
            if m:
                data[field] = m.group(1).strip()

    return _normalise(data)


def _normalise(data: dict) -> dict | None:
    if not all(data.get(f) for f in REQUIRED_FIELDS):
        return None

    out = dict(data)

    # amount -> number when possible.
    if "amount" in out and out["amount"] is not None:
        try:
            out["amount"] = float(str(out["amount"]).replace(",", "").strip())
        except ValueError:
            pass

    # Combine a time-only value with the parking date into an ISO datetime, so
    # the judgement step gets the same shape the demo data uses.
    parking_date = out.get("parking_date")
    for field in ("parking_start", "parking_end"):
        value = out.get(field)
        if value and parking_date and _is_time_only(value):
            out[field] = f"{parking_date}T{_pad_time(value)}"

    return out


_TIME_ONLY_RE = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


def _is_time_only(value: str) -> bool:
    return bool(_TIME_ONLY_RE.match(value.strip()))


def _pad_time(value: str) -> str:
    parts = value.strip().split(":")
    if len(parts) == 2:
        parts.append("00")
    return ":".join(p.zfill(2) for p in parts)
