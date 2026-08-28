"""
Business rules extracted from the design docs in the project README:

- Ticket number parsing (example: Q7028435D095253)
- Issue-time reconstruction (year from parking date, month/day/time from ticket no)
- Overdue judgment (issue time vs. parking start time, 60 minute threshold)

These are intentionally kept as pure functions with no DB/HTTP dependency so
they're easy to unit-test and to re-use for both the "preview" endpoint
(what the inspector app shows live) and the "save" endpoint (the
authoritative backend re-calculation), mirroring the "後端重新驗證/重新計算"
step in the sequence diagram.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

# Q + [month:1 digit][day:2 digits] + [inspector code: 5 alphanumeric] + [HHMMSS: 6 digits]
# Example: Q7028435D095253 -> Q | 7 02 | 8435D | 09 52 53
#   date segment  "702"  -> month=7, day=02
#   inspector code "8435D"
#   time segment  "095253" -> 09:52:53
#
# Month is variable-width (1 or 2 digits) so October-December (10/11/12)
# tickets parse correctly, not just 1-9. The encoding stays unambiguous
# because every other field is fixed-width: after the leading "Q" there are
# exactly day(2) + inspector_code(5) + HH(2) + MM(2) + SS(2) = 13 trailing
# characters, so whatever digits remain in the middle are the month. The
# single-digit example from the spec (Q7028435D095253) still parses; a
# two-digit month simply makes the ticket one character longer
# (Q12028435D095253). The regex resolves this by backtracking on the 1-2 digit
# month against the fixed-width tail.
#
# ASSUMPTION (still worth confirming with the ticket-issuing authority): that
# two-digit months are encoded inline this way rather than, say, zero-padded to
# a fixed two digits for all months. If the real encoding differs, only this
# pattern needs to change.
TICKET_NO_PATTERN = re.compile(
    r"^Q(?P<month>\d{1,2})(?P<day>\d{2})(?P<inspector_code>[0-9A-Za-z]{5})"
    r"(?P<hour>\d{2})(?P<minute>\d{2})(?P<second>\d{2})$"
)

DEFAULT_OVERDUE_THRESHOLD_MINUTES = 60


class TicketParseError(Exception):
    """Raised when a ticket number does not match the expected format."""


@dataclass
class ParsedTicketNo:
    month: int
    day: int
    inspector_code: str
    hour: int
    minute: int
    second: int


def parse_ticket_no(ticket_no: str) -> ParsedTicketNo:
    if not ticket_no:
        raise TicketParseError("帳單編號為空")

    match = TICKET_NO_PATTERN.match(ticket_no.strip().upper())
    if not match:
        raise TicketParseError(
            f"帳單編號格式錯誤：「{ticket_no}」不符合 Q+日期(3碼)+開單員編號(5碼)+時間(6碼) 格式"
        )

    month = int(match.group("month"))
    day = int(match.group("day"))
    hour = int(match.group("hour"))
    minute = int(match.group("minute"))
    second = int(match.group("second"))

    if not (1 <= month <= 12):
        raise TicketParseError(f"帳單編號月份錯誤：month={month}")
    if not (1 <= day <= 31):
        raise TicketParseError(f"帳單編號日期錯誤：day={day}")
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        raise TicketParseError(f"帳單編號時間錯誤：{hour:02d}:{minute:02d}:{second:02d}")

    return ParsedTicketNo(
        month=month,
        day=day,
        inspector_code=match.group("inspector_code"),
        hour=hour,
        minute=minute,
        second=second,
    )


# A ticket number encodes month/day/time but not year, so the year is
# inferred from parking_date. That breaks across a year boundary: a ticket
# physically issued right before midnight on Dec 31 but entered/synced after
# midnight has parking_date already rolled to Jan 1 of the next year, which
# puts the naively-reconstructed issue_datetime ~365 days from the real
# parking_start — a genuinely-compliant ticket then reads as wildly OVERDUE
# instead of looking anomalous. See IMPLEMENTATION_LOG.md for the writeup.
_YEAR_ROLLOVER_SEARCH_THRESHOLD = timedelta(hours=48)


def _issue_datetime_for_year(year: int, parsed: ParsedTicketNo) -> datetime:
    return datetime(
        year=year,
        month=parsed.month,
        day=parsed.day,
        hour=parsed.hour,
        minute=parsed.minute,
        second=parsed.second,
    )


def compute_issue_datetime(
    parking_date: date,
    parsed: ParsedTicketNo,
    parking_start: datetime | None = None,
) -> datetime:
    """年份取自停車日期，月日取自帳單編號，時分秒取自帳單編號

    When `parking_start` is given and the naive (parking_date.year) result
    lands implausibly far from it (> 48h), that's very likely a year-boundary
    artifact rather than a real anomaly: retry with year-1/year+1 and keep
    whichever reconstruction lands closest to parking_start. Without
    `parking_start`, or when the naive result is already plausible, behaviour
    is unchanged.
    """
    naive = _issue_datetime_for_year(parking_date.year, parsed)
    if parking_start is None:
        return naive

    best, best_gap = naive, abs(naive - parking_start)
    if best_gap > _YEAR_ROLLOVER_SEARCH_THRESHOLD:
        for year in (parking_date.year - 1, parking_date.year + 1):
            try:
                candidate = _issue_datetime_for_year(year, parsed)
            except ValueError:
                continue  # e.g. Feb 29 doesn't exist in the adjacent year
            gap = abs(candidate - parking_start)
            if gap < best_gap:
                best, best_gap = candidate, gap
    return best


@dataclass
class JudgmentResult:
    issue_datetime: datetime
    time_diff_minutes: float
    judgement: str  # COMPLIANT | OVERDUE | DATA_ERROR


def judge_time_diff(
    issue_datetime: datetime,
    parking_start: datetime,
    threshold_minutes: float = DEFAULT_OVERDUE_THRESHOLD_MINUTES,
) -> JudgmentResult:
    """時間差 = 開單時間 - 停車開始時間

    threshold_minutes is configurable from the admin console's "系統設定"
    tab (persisted in the settings table as overdue_threshold_minutes) so
    this is a real, end-to-end configurable rule rather than a cosmetic
    setting - see main.py's _current_overdue_threshold().
    """
    diff: timedelta = issue_datetime - parking_start
    diff_minutes = diff.total_seconds() / 60

    if diff_minutes < 0:
        judgement = "DATA_ERROR"  # 開單時間早於停車開始時間
    elif diff_minutes > threshold_minutes:
        judgement = "OVERDUE"
    else:
        judgement = "COMPLIANT"

    return JudgmentResult(
        issue_datetime=issue_datetime,
        time_diff_minutes=round(diff_minutes, 2),
        judgement=judgement,
    )
