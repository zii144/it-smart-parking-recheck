"""Blocker 6 - ticket-number month parsing.

The parser must handle two-digit months (Oct-Dec) as well as the single-digit
example from the spec, and reject out-of-range months.
"""
from __future__ import annotations

from datetime import date, datetime

import pytest

from app.business_rules import (
    TicketParseError,
    compute_issue_datetime,
    parse_ticket_no,
)


def test_single_digit_month_still_parses():
    p = parse_ticket_no("Q7028435D095253")
    assert (p.month, p.day) == (7, 2)
    assert p.inspector_code == "8435D"
    assert (p.hour, p.minute, p.second) == (9, 52, 53)


@pytest.mark.parametrize(
    "ticket_no,month",
    [
        ("Q1015ABCDE010203", 10),
        ("Q1115ABCDE010203", 11),
        ("Q1205ABCDE095253", 12),
    ],
)
def test_two_digit_months_parse(ticket_no, month):
    p = parse_ticket_no(ticket_no)
    assert p.month == month
    assert p.inspector_code == "ABCDE"


def test_two_digit_month_flows_into_issue_datetime():
    p = parse_ticket_no("Q1205ABCDE095253")
    issued = compute_issue_datetime(date(2026, 12, 5), p)
    assert issued.month == 12 and issued.day == 5
    assert (issued.hour, issued.minute, issued.second) == (9, 52, 53)


def test_year_rollover_at_new_year_reconstructs_correct_year():
    # Ticket physically issued 2026-12-31 23:58:00, but parking_date got
    # entered/synced after midnight -> rolled to 2027-01-01. The naive
    # (parking_date.year) reconstruction would land ~365 days from the real
    # parking_start; passing parking_start lets it self-correct to 2026.
    p = parse_ticket_no("Q12318435D235800")
    parking_start = datetime(2026, 12, 31, 23, 55, 0)
    issued = compute_issue_datetime(date(2027, 1, 1), p, parking_start)
    assert issued == datetime(2026, 12, 31, 23, 58, 0)


def test_year_rollover_without_parking_start_keeps_naive_behaviour():
    # No parking_start given -> old, naive behaviour is preserved exactly
    # (needed so seed.py's 2-arg call site keeps working unchanged).
    p = parse_ticket_no("Q12318435D235800")
    issued = compute_issue_datetime(date(2027, 1, 1), p)
    assert issued.year == 2027


def test_plausible_naive_result_is_not_overridden_by_year_search():
    # A same-day, plausible naive result must NOT be second-guessed just
    # because parking_start is present — the year-search only kicks in past
    # the 48h implausibility threshold.
    p = parse_ticket_no("Q7028435D095253")
    parking_start = datetime(2026, 7, 2, 9, 10, 0)
    issued = compute_issue_datetime(date(2026, 7, 2), p, parking_start)
    assert issued.year == 2026


@pytest.mark.parametrize("ticket_no", ["Q0028435D095253", "Q1315ABCDE010203"])
def test_month_out_of_range_rejected(ticket_no):
    with pytest.raises(TicketParseError):
        parse_ticket_no(ticket_no)


def test_garbage_still_rejected():
    with pytest.raises(TicketParseError):
        parse_ticket_no("BADTICKET123")
