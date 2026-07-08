"""Blocker 5 - uploaded photo validation.

The photo endpoint must reject non-images, SVG, and oversized payloads, and
must derive the stored extension from the real content type (magic bytes), not
the client-supplied filename.
"""
from __future__ import annotations

import base64

import app.main as main_mod
from app.media import sniff_image_ext, validate_photo
from tests.conftest import auth

# A real 1x1 PNG.
_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def _case_payload(**overrides):
    payload = {
        "ticket_no": "Q7036002A121045",  # COMPLIANT, not pre-seeded
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


# --- unit-level ------------------------------------------------------------
def test_sniff_recognises_png_and_rejects_svg():
    assert sniff_image_ext(base64.b64decode(_PNG_B64)) == "png"
    assert sniff_image_ext(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>") is None


def test_validate_photo_strips_data_url_prefix():
    raw, ext = validate_photo("data:image/png;base64," + _PNG_B64, max_bytes=1_000_000)
    assert ext == "png" and raw[:8] == b"\x89PNG\r\n\x1a\n"


# --- endpoint --------------------------------------------------------------
def test_valid_png_is_saved_with_detected_extension(client, inspector_token):
    # Client lies about the filename (.svg); server must ignore it and use .png.
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_case_payload(photo_base64=_PNG_B64, photo_filename="evil.svg"),
    )
    assert res.status_code == 200, res.text
    assert res.json()["photo_path"].endswith(".png")


def test_non_image_payload_is_rejected(client, inspector_token):
    junk = base64.b64encode(b"this is not an image").decode()
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_case_payload(photo_base64=junk),
    )
    assert res.status_code == 400


def test_svg_payload_is_rejected(client, inspector_token):
    svg = base64.b64encode(b"<svg onload=alert(1)></svg>").decode()
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_case_payload(photo_base64=svg),
    )
    assert res.status_code == 400


def test_oversized_payload_is_rejected(client, inspector_token, monkeypatch):
    monkeypatch.setattr(main_mod.settings, "max_upload_bytes", 1000)
    # ~2.25 KB of decoded data, above the 1 KB cap -> 413.
    big = "A" * 3000
    res = client.post(
        "/api/cases",
        headers=auth(inspector_token),
        json=_case_payload(photo_base64=big),
    )
    assert res.status_code == 413


def test_nosniff_header_present(client):
    res = client.get("/api/health")
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
