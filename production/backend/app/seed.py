"""Static demo data for the prototype: inspector accounts, the admin account,
the location picklist, default system settings, and simulated QR Code ->
query-page responses (standing in for the real external "QR 查詢網站"). Also
seeds one pre-existing case so the duplicate-ticket-number warning has
something to collide with out of the box.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select

from . import business_rules as rules
from .clock import local_now_iso
from .config import get_settings
from .db import SessionLocal, get_setting, set_setting
from .models import AdminUser, Case, Inspector, Location
from .security import ROLE_SYSADMIN, hash_password

# --- Inspector accounts -----------------------------------------------------
# insp01 has inspection permission; insp02 does not (demoes the "無權限" branch).
DEMO_INSPECTORS = [
    {"username": "insp01", "password": "pass123", "display_name": "王小明", "has_permission": 1},
    {"username": "insp02", "password": "pass123", "display_name": "李小華", "has_permission": 0},
]

# --- Admin console accounts --------------------------------------------------
# The design's two distinct back-office actors, each with its own login/role:
#   manager01  (管理人員)   -> review queue, case search, stats, export
#   sysadmin01 (系統管理員) -> inspector accounts, locations, system settings
DEMO_ADMINS = [
    {"username": "manager01", "password": "manager123", "display_name": "陳經理", "role": "manager"},
    {"username": "sysadmin01", "password": "sysadmin123", "display_name": "林管理員", "role": "sysadmin"},
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
    # Districts/roads seen on the real sample tickets (target-sample/), so the
    # GPS district suggestion and road picklists line up with real fieldwork.
    {
        "district": "內湖區",
        "roads": [
            {"road": "成功路5段450巷22弄", "spots": ["0020", "0021"]},
        ],
    },
    {
        "district": "南港區",
        "roads": [
            {"road": "經園街(機車)", "spots": ["0000"]},
            {"road": "舊莊街1段", "spots": ["30", "31"]},
        ],
    },
    {
        "district": "松山區",
        "roads": [
            {"road": "民生東路4段80巷", "spots": ["05", "06"]},
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
        # Same location as the pre-seeded duplicate case, so the DUPLICATE demo
        # collides on location too, not just on ticket_no.
        "district": "中正區",
        "road": "信義路",
        "spot_no": "A-012",
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
        "district": "大安區",
        "road": "敦化南路",
        "spot_no": "C-101",
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
        # Location as printed on the real 內湖區 sample ticket (target-sample/).
        "district": "內湖區",
        "road": "成功路5段450巷22弄",
        "spot_no": "0020",
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
        # Location as printed on the real 松山區 sample ticket (target-sample/).
        "district": "松山區",
        "road": "民生東路4段80巷",
        "spot_no": "05",
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
            "停車結束時間：14:30\n"
            "行政區：南港區\n"
            "停車地點：舊莊街1段\n"
            "車位編號：30"
        ),
        "note": "Simulates the QR decoding fine but the page failing to load; inspector reads page_preview and fills the form (MANUAL_FROM_QR_PAGE).",
    },
}

# any code not in QR_DEMO_CODES (e.g. "QR-BAD-SCAN") is treated as a scan failure.


def _ensure_bootstrap_admin(db) -> None:
    """Create the first sysadmin from the environment if configured and absent.

    Production runs with SEED_DEMO_DATA=false, so none of the DEMO_ADMINS are
    created and there'd be no way to sign into the console on a fresh deploy.
    Setting BOOTSTRAP_ADMIN_USERNAME / BOOTSTRAP_ADMIN_PASSWORD provisions one
    sysadmin from env vars instead — no credential is hard-coded in the source
    tree, and it's idempotent (only created when that username doesn't exist).
    Once the real admins are created through the UI, the env vars can be dropped.
    """
    s = get_settings()
    if not s.bootstrap_admin_username or not s.bootstrap_admin_password:
        return
    if db.scalar(
        select(AdminUser).where(AdminUser.username == s.bootstrap_admin_username)
    ) is not None:
        return
    db.add(
        AdminUser(
            username=s.bootstrap_admin_username,
            password=hash_password(s.bootstrap_admin_password),
            display_name=s.bootstrap_admin_display_name or s.bootstrap_admin_username,
            role=ROLE_SYSADMIN,
            is_active=1,
            created_at=local_now_iso(),
            created_by="bootstrap",
        )
    )


def seed(force: bool = False, demo: bool = True) -> None:
    """Idempotently populate the database. Passwords are bcrypt-hashed on
    insert, so no plaintext credential is ever written to the database.

    Default system settings (e.g. the overdue threshold) are needed in every
    environment and are always ensured. Demo accounts / locations / the sample
    case are only created when `demo` is True — production passes demo=False
    (SEED_DEMO_DATA=false) so no known-credential accounts reach a real deploy.
    """
    db = SessionLocal()
    try:
        # Always ensure default settings, in every environment.
        for key, value in DEFAULT_SETTINGS.items():
            if get_setting(db, key) is None:
                set_setting(db, key, value)

        # Provision the env-configured bootstrap sysadmin in every environment
        # (including production, where demo seeding is off) so a fresh deploy is
        # never left with no way to log into the console.
        _ensure_bootstrap_admin(db)

        if not demo:
            db.commit()
            return

        existing = db.scalar(select(func.count()).select_from(Inspector)) or 0
        if existing and not force:
            db.commit()
            return

        for insp in DEMO_INSPECTORS:
            if db.scalar(select(Inspector).where(Inspector.username == insp["username"])) is None:
                db.add(
                    Inspector(
                        username=insp["username"],
                        password=hash_password(insp["password"]),
                        display_name=insp["display_name"],
                        has_permission=insp["has_permission"],
                    )
                )

        for admin in DEMO_ADMINS:
            if db.scalar(select(AdminUser).where(AdminUser.username == admin["username"])) is None:
                db.add(
                    AdminUser(
                        username=admin["username"],
                        password=hash_password(admin["password"]),
                        display_name=admin["display_name"],
                        role=admin["role"],
                        is_active=1,
                        created_at=local_now_iso(),
                        created_by="system",
                    )
                )

        existing_locations = db.scalar(select(func.count()).select_from(Location)) or 0
        if not existing_locations:
            for district in SEED_LOCATIONS:
                for road in district["roads"]:
                    for spot in road["spots"]:
                        db.add(
                            Location(
                                district=district["district"],
                                road=road["road"],
                                spot_no=spot,
                            )
                        )

        # Pre-existing stored case so QR-A1001's ticket number is already "in
        # the system" -> saving it again triggers the duplicate-ticket warning.
        existing_case = db.scalar(
            select(Case).where(Case.ticket_no == "Q7028435D095253")
        )
        if existing_case is None:
            parsed = rules.parse_ticket_no("Q7028435D095253")
            parking_date = datetime.fromisoformat("2026-07-02").date()
            issue_dt = rules.compute_issue_datetime(parking_date, parsed)
            parking_start = datetime.fromisoformat("2026-07-02T09:05:00")
            result = rules.judge_time_diff(issue_dt, parking_start)

            db.add(
                Case(
                    ticket_no="Q7028435D095253",
                    district="中正區",
                    road="信義路",
                    spot_no="A-012",
                    plate_no="ABC-1234",
                    amount=900,
                    due_date="2026-07-22",
                    parking_date="2026-07-02",
                    parking_start="2026-07-02T09:05:00",
                    parking_end="2026-07-02T10:05:00",
                    data_source="AUTO_QR",
                    manual_corrected=0,
                    original_values=None,
                    inspector_username="insp01",
                    issue_datetime=issue_dt.isoformat(),
                    time_diff_minutes=result.time_diff_minutes,
                    judgement=result.judgement,
                    review_required=0,
                    duplicate_warning=0,
                    photo_path=None,
                    status="CLOSED",
                    synced_offline=0,
                    created_at="2026-07-02T10:20:00",
                )
            )

        db.commit()
    finally:
        db.close()
