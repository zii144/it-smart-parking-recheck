"""Static demo data for the prototype: inspector accounts, the admin account,
the location picklist, default system settings, and simulated QR Code ->
query-page responses (standing in for the real external "QR 查詢網站"). Also
seeds one pre-existing case so the duplicate-ticket-number warning has
something to collide with out of the box.
"""
from __future__ import annotations

from datetime import datetime

from . import business_rules as rules
from .db import get_connection, get_setting, set_setting

# --- Inspector accounts -----------------------------------------------------
# insp01 has inspection permission; insp02 does not (demoes the "無權限" branch).
DEMO_INSPECTORS = [
    {"username": "insp01", "password": "pass123", "display_name": "王小明", "has_permission": 1},
    {"username": "insp02", "password": "pass123", "display_name": "李小華", "has_permission": 0},
]

# --- Admin console account ---------------------------------------------------
# One combined account for both the "管理人員" (review/stats/export) and
# "系統管理員" (accounts/rules/locations) roles - see prototype/README.md for
# why this prototype doesn't separate the two into distinct logins.
DEMO_ADMINS = [
    {"username": "admin01", "password": "admin123", "display_name": "陳經理"},
]

# --- Location picklist (seeds the DB-backed `locations` table) --------------
SEED_LOCATIONS = [
    {
        "district": "中正區",
        "roads": [
            {"road": "信義路", "spots": ["A-012", "A-013", "A-014"]},
            {"road": "羅斯福路", "spots": ["B-021", "B-022"]},
        ],
    },
    {
        "district": "大安區",
        "roads": [
            {"road": "敦化南路", "spots": ["C-101", "C-102"]},
            {"road": "和平東路", "spots": ["D-055"]},
        ],
    },
]

# --- Default system parameters (editable from the admin "系統設定" tab) -----
DEFAULT_SETTINGS = {
    "overdue_threshold_minutes": str(rules.DEFAULT_OVERDUE_THRESHOLD_MINUTES),
}

# --- Simulated QR Code -> query-page responses ------------------------------
# type "success"      -> APP successfully reads the query page, fields auto-fill (AUTO_QR)
# type "fetch_failed"  -> QR decodes fine but the page can't be read; inspector
#                         transcribes from page_preview (MANUAL_FROM_QR_PAGE)
# any other/unknown code -> treated as an unreadable QR (scan_failed), the
#                         inspector falls back to typing the ticket by hand
#                         (MANUAL_FROM_TICKET)
QR_DEMO_CODES = {
    "QR-A1001": {
        "type": "success",
        "ticket_no": "Q7028435D095253",
        "plate_no": "ABC-1234",
        "amount": 900,
        "due_date": "2026-07-22",
        "parking_date": "2026-07-02",
        "parking_start": "2026-07-02T09:10:00",
        "parking_end": "2026-07-02T10:10:00",
        "note": "COMPLIANT judgement, and collides with the pre-seeded case below (DUPLICATE demo).",
    },
    "QR-A1002": {
        "type": "success",
        "ticket_no": "Q7029001B101530",
        "plate_no": "XYZ-5678",
        "amount": 1200,
        "due_date": "2026-07-23",
        "parking_date": "2026-07-02",
        "parking_start": "2026-07-02T08:50:00",
        "parking_end": "2026-07-02T09:50:00",
        "note": "OVERDUE judgement demo (~85 min gap).",
    },
    "QR-A1003": {
        "type": "success",
        "ticket_no": "Q7017788C080000",
        "plate_no": "DEF-9012",
        "amount": 900,
        "due_date": "2026-07-21",
        "parking_date": "2026-07-01",
        "parking_start": "2026-07-01T09:00:00",
        "parking_end": "2026-07-01T10:00:00",
        "note": "DATA_ERROR demo: ticket issue time (08:00) is before parking start (09:00).",
    },
    "QR-A1004": {
        "type": "success",
        "ticket_no": "Q7036002A121045",
        "plate_no": "GHI-3456",
        "amount": 900,
        "due_date": "2026-07-24",
        "parking_date": "2026-07-03",
        "parking_start": "2026-07-03T11:40:00",
        "parking_end": "2026-07-03T12:40:00",
        "note": "Clean COMPLIANT demo, no duplicate.",
    },
    "QR-A1005": {
        "type": "fetch_failed",
        "query_url": "https://qr.parking-demo.gov.tw/t/9f8e7d",
        "page_preview": (
            "帳單編號：Q7038877E140500\n"
            "車牌號碼：JKL-7890\n"
            "應繳金額：900\n"
            "繳費期限：2026-07-25\n"
            "停車日期：2026-07-03\n"
            "停車開始時間：13:30\n"
            "停車結束時間：14:30"
        ),
        "note": "Simulates the QR decoding fine but the page failing to load; inspector reads page_preview and fills the form (MANUAL_FROM_QR_PAGE).",
    },
}

# any code not in QR_DEMO_CODES (e.g. "QR-BAD-SCAN") is treated as a scan failure.


def seed(force: bool = False) -> None:
    conn = get_connection()
    try:
        existing = conn.execute("SELECT COUNT(*) AS c FROM inspectors").fetchone()["c"]
        if existing and not force:
            return

        for insp in DEMO_INSPECTORS:
            conn.execute(
                "INSERT OR IGNORE INTO inspectors (username, password, display_name, has_permission) "
                "VALUES (:username, :password, :display_name, :has_permission)",
                insp,
            )

        for admin in DEMO_ADMINS:
            conn.execute(
                "INSERT OR IGNORE INTO admin_users (username, password, display_name) "
                "VALUES (:username, :password, :display_name)",
                admin,
            )

        existing_locations = conn.execute("SELECT COUNT(*) AS c FROM locations").fetchone()["c"]
        if not existing_locations:
            for district in SEED_LOCATIONS:
                for road in district["roads"]:
                    for spot in road["spots"]:
                        conn.execute(
                            "INSERT INTO locations (district, road, spot_no) VALUES (?, ?, ?)",
                            (district["district"], road["road"], spot),
                        )

        for key, value in DEFAULT_SETTINGS.items():
            if get_setting(conn, key) is None:
                set_setting(conn, key, value)

        # Pre-existing stored case so QR-A1001's ticket number is already "in
        # the system" -> saving it again triggers the duplicate-ticket warning.
        existing_case = conn.execute(
            "SELECT COUNT(*) AS c FROM cases WHERE ticket_no = ?", ("Q7028435D095253",)
        ).fetchone()["c"]
        if not existing_case:
            parsed = rules.parse_ticket_no("Q7028435D095253")
            parking_date = datetime.fromisoformat("2026-07-02").date()
            issue_dt = rules.compute_issue_datetime(parking_date, parsed)
            parking_start = datetime.fromisoformat("2026-07-02T09:05:00")
            result = rules.judge_time_diff(issue_dt, parking_start)

            conn.execute(
                """
                INSERT INTO cases (
                    ticket_no, district, road, spot_no, plate_no, amount, due_date,
                    parking_date, parking_start, parking_end, data_source,
                    manual_corrected, original_values, inspector_username,
                    issue_datetime, time_diff_minutes, judgement, review_required,
                    duplicate_warning, photo_path, status, synced_offline, created_at
                ) VALUES (
                    :ticket_no, :district, :road, :spot_no, :plate_no, :amount, :due_date,
                    :parking_date, :parking_start, :parking_end, :data_source,
                    0, NULL, :inspector_username,
                    :issue_datetime, :time_diff_minutes, :judgement, 0,
                    0, NULL, :status, 0, :created_at
                )
                """,
                {
                    "ticket_no": "Q7028435D095253",
                    "district": "中正區",
                    "road": "信義路",
                    "spot_no": "A-012",
                    "plate_no": "ABC-1234",
                    "amount": 900,
                    "due_date": "2026-07-22",
                    "parking_date": "2026-07-02",
                    "parking_start": "2026-07-02T09:05:00",
                    "parking_end": "2026-07-02T10:05:00",
                    "data_source": "AUTO_QR",
                    "inspector_username": "insp01",
                    "issue_datetime": issue_dt.isoformat(),
                    "time_diff_minutes": result.time_diff_minutes,
                    "judgement": result.judgement,
                    "status": "CLOSED",
                    "created_at": "2026-07-02T10:20:00",
                },
            )

        conn.commit()
    finally:
        conn.close()
