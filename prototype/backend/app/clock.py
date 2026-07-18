"""Wall-clock helpers pinned to the app's operating timezone (Asia/Taipei).

All human-facing timestamps — `cases.created_at` / `reviewed_at`, the admin
account audit `created_at`, and the CSV 稽查日期/檢查時間 derived from them —
are Taipei-local. The code previously stored `datetime.now()` (naive,
server-local), so a container running in UTC (the common case) recorded and
exported times 8 hours behind Taipei: a case created just after local midnight
printed on the *previous* day in the CSV export.

Pinning to Asia/Taipei keeps the stored strings in the same naive
"YYYY-MM-DDTHH:MM:SS" shape (no timezone offset, so the existing created_at
prefix/substring date queries in the admin filters and stats are unaffected)
while making them correct regardless of the server's timezone. The core overdue
judgement is unaffected either way — it compares two datetimes reconstructed
from the same source.
"""
from __future__ import annotations

from datetime import datetime

try:  # pragma: no cover - exercised implicitly; the except path needs no tzdata
    from zoneinfo import ZoneInfo

    _TAIPEI: ZoneInfo | None = ZoneInfo("Asia/Taipei")
except Exception:  # pragma: no cover - missing tz database; degrade to server-local
    _TAIPEI = None


def local_now() -> datetime:
    """Current Taipei wall-clock time as a *naive* datetime."""
    if _TAIPEI is None:
        return datetime.now()
    return datetime.now(_TAIPEI).replace(tzinfo=None)


def local_now_iso() -> str:
    """Current Taipei wall-clock time as 'YYYY-MM-DDTHH:MM:SS' (naive)."""
    return local_now().isoformat(timespec="seconds")
