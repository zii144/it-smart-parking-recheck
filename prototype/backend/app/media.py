"""Uploaded photo validation (Blocker 5).

The inspector app sends the evidence photo as a base64 string. Previously it was
decoded and written to disk with no checks, and the file extension came from the
client-supplied filename - so a caller could upload arbitrary bytes of arbitrary
size, and steer the stored extension (e.g. to `svg`, which browsers render as
active content -> stored XSS when served from /uploads).

`validate_photo` closes that: it caps the size, sniffs the real content type
from magic bytes (ignoring the client's filename/extension entirely), and only
accepts a small allow-list of raster image formats. SVG and anything
unrecognised are rejected. The returned extension is derived from the detected
type, so what lands on disk always matches what the bytes actually are.
"""
from __future__ import annotations

import base64
import binascii

from fastapi import HTTPException

# (detected extension, matcher). Matchers look at the leading bytes; WEBP and
# HEIC need a couple of bytes past the start, hence the callables.
_JPEG = b"\xff\xd8\xff"
_PNG = b"\x89PNG\r\n\x1a\n"
_GIF87 = b"GIF87a"
_GIF89 = b"GIF89a"
# HEIC/HEIF brands appear in the ftyp box (bytes 4..12).
_HEIF_BRANDS = (b"heic", b"heix", b"hevc", b"heif", b"mif1", b"msf1")


def sniff_image_ext(data: bytes) -> str | None:
    """Return a safe file extension for a recognised raster image, else None."""
    if data.startswith(_JPEG):
        return "jpg"
    if data.startswith(_PNG):
        return "png"
    if data.startswith(_GIF87) or data.startswith(_GIF89):
        return "gif"
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] in _HEIF_BRANDS:
        return "heic"
    return None


def validate_photo(photo_base64: str, *, max_bytes: int) -> tuple[bytes, str]:
    """Decode + validate a base64 photo payload.

    Returns (raw_bytes, extension). Raises HTTPException(400) for malformed or
    unsupported content and HTTPException(413) when it exceeds `max_bytes`.
    """
    # Strip an optional `data:image/...;base64,` prefix.
    raw_b64 = photo_base64.split(",", 1)[-1].strip()
    if not raw_b64:
        raise HTTPException(status_code=400, detail="照片內容為空")

    # Reject oversized payloads before allocating the decoded bytes. base64 is
    # ~4/3 the size of its output, so this bounds the decode up front.
    if len(raw_b64) > (max_bytes * 4) // 3 + 4:
        raise HTTPException(status_code=413, detail="照片檔案過大")

    try:
        data = base64.b64decode(raw_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="照片編碼格式錯誤")

    if not data:
        raise HTTPException(status_code=400, detail="照片內容為空")
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail="照片檔案過大")

    ext = sniff_image_ext(data)
    if ext is None:
        raise HTTPException(
            status_code=400,
            detail="不支援的照片格式，僅接受 JPEG / PNG / WebP / GIF / HEIC 圖片",
        )
    return data, ext
