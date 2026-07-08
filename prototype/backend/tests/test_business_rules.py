"""Blocker 6 - ticket-number month parsing.

The parser must handle two-digit months (Oct-Dec) as well as the single-digit
example from the spec, and reject out-of-range months.
"""
from __future__ import annotations

from datetime import date

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


@pytest.mark.parametrize("ticket_no", ["Q0028435D095253", "Q1315ABCDE010203"])
def test_month_out_of_range_rejected(ticket_no):
    with pytest.raises(TicketParseError):
        parse_ticket_no(ticket_no)


def test_garbage_still_rejected():
    with pytest.raises(TicketParseError):
        parse_ticket_no("BADTICKET123")
