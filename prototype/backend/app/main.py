"""FastAPI backend for the parking-ticket inspection app.

Two front ends share this one API:
  - the inspector-facing mobile flow (/api/... - login, locations, qr scan,
    case preview/save)
  - the admin console (/api/admin/... - review queue, case search, stats,
    CSV export, inspector accounts, locations, system settings)

Persistence is SQLAlchemy over SQLite (local/tests) or PostgreSQL
(deployment), selected by DATABASE_URL. Schema is managed by Alembic.

Security:
  - passwords are bcrypt-hashed (app/security.py), never stored in plaintext;
  - login returns a signed, expiring JWT instead of base64(username);
  - every non-public route is guarded by require_inspector / require_manager /
    require_sysadmin, so the admin console API is no longer callable without the
    right role token (管理人員 vs 系統管理員 are separately enforced);
  - CORS is an explicit allow-list from config, not "*".

Endpoints:
  POST /api/login                    - inspector login -> JWT (+ has_permission)
  GET  /api/locations                - district/road/parking-spot picklist [inspector]
  POST /api/qr/scan                  - simulated QR-code lookup [inspector]
  POST /api/cases/preview            - run parsing + judgement without saving [inspector]
  POST /api/cases                    - authoritative save [inspector]
  GET  /api/cases                    - the caller's own submissions [inspector]

  POST /api/admin/login               - admin console login -> role-based JWT
  GET  /api/admin/cases               - filtered case query [manager]
  GET  /api/admin/cases/{id}          - single case detail [manager]
  POST /api/admin/cases/{id}/review   - record a review decision [manager]
  GET  /api/admin/stats               - aggregate statistics [manager]
  GET  /api/admin/export.csv          - CSV export of all cases [manager]
  GET  /api/admin/inspectors          - list inspector accounts [sysadmin]
  POST /api/admin/inspectors          - create an inspector account [sysadmin]
  PATCH /api/admin/inspectors/{username} - update permission/name/password [sysadmin]
  GET  /api/admin/locations           - flat list of parking spots [sysadmin]
  POST /api/admin/locations           - add a parking spot [sysadmin]
  DELETE /api/admin/locations/{id}    - remove a parking spot [sysadmin]
  GET  /api/admin/settings            - current system settings [sysadmin]
  PUT  /api/admin/settings            - update system settings [sysadmin]
"""
from __future__ import annotations

import base64
import csv
import io
import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import business_rules as rules
from . import qr_service
from .config import get_settings
from .db import get_db, get_setting, init_db, set_setting
from .models import AdminUser, Case, Inspector, Location, row_to_dict
from .security import (
    ROLE_INSPECTOR,
    Principal,
    create_access_token,
    hash_password,
    require_inspector,
    require_manager,
    require_sysadmin,
    verify_password,
)
from .seed import QR_DEMO_CODES, seed

logger = logging.getLogger("parking")
settings = get_settings()

UPLOADS_DIR = settings.uploads_dir
UPLOADS_DIR.mkdir(exist_ok=True, parents=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Postgres deployments get their schema from `alembic upgrade head` (run by
    # the container entrypoint). For a local SQLite run without Alembic, create
    # the tables directly so the app is still usable out of the box.
    if settings.database_url.startswith("sqlite"):
        init_db()
    seed()
    if settings.jwt_secret_is_default:
        logger.warning(
            "JWT_SECRET is the insecure development default. "
            "Set JWT_SECRET to a strong random value before deploying."
        )
    yield


app = FastAPI(title="Parking Ticket Inspection API", lifespan=lifespan)

# CORS: explicit allow-list (Goal 3). No wildcard. Bearer tokens are sent in
# the Authorization header (not cookies), so credentials are not required.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class LoginRequest(BaseModel):
    username: str
    password: str


class CasePreviewRequest(BaseModel):
    ticket_no: str
    parking_date: str  # YYYY-MM-DD
    parking_start: str  # ISO datetime


class CaseCreateRequest(BaseModel):
    ticket_no: str
    district: str
    road: str
    spot_no: str
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    plate_no: str
    amount: float
    due_date: str
    parking_date: str
    parking_start: str
    parking_end: str
    data_source: str  # AUTO_QR | MANUAL_FROM_QR_PAGE | MANUAL_FROM_TICKET
    manual_corrected: bool = False
    original_values: Optional[dict] = None
    inspector_username: str
    photo_base64: Optional[str] = None
    photo_filename: Optional[str] = None
    save_anyway: bool = False
    offline_submitted: bool = False


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class ReviewRequest(BaseModel):
    outcome: str  # DATA_ERROR | DUPLICATE | NEED_INFO | CONFIRMED | DISMISSED
    note: Optional[str] = None
    reviewed_by: str


class InspectorCreateRequest(BaseModel):
    username: str
    password: str
    display_name: str
    has_permission: bool = True


class InspectorUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    has_permission: Optional[bool] = None
    password: Optional[str] = None


class LocationCreateRequest(BaseModel):
    district: str
    road: str
    spot_no: str


class SettingsUpdateRequest(BaseModel):
    overdue_threshold_minutes: float


# --------------------------------------------------------------------------
# Inspector auth
# --------------------------------------------------------------------------
@app.post("/api/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    row = db.scalar(select(Inspector).where(Inspector.username == payload.username))

    if row is None or not verify_password(payload.password, row.password):
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    return {
        "token": create_access_token(row.username, ROLE_INSPECTOR),
        "inspector": {
            "username": row.username,
            "display_name": row.display_name,
            "has_permission": bool(row.has_permission),
        },
    }


# --------------------------------------------------------------------------
# Locations (DB-backed so the admin console's "路段管理" tab can edit them)
# --------------------------------------------------------------------------
@app.get("/api/locations")
def get_locations(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_inspector),
):
    rows = db.execute(
        select(Location.district, Location.road, Location.spot_no).order_by(
            Location.district, Location.road, Location.spot_no
        )
    ).all()

    districts: dict[str, dict[str, list[str]]] = {}
    for r in rows:
        roads = districts.setdefault(r.district, {})
        roads.setdefault(r.road, []).append(r.spot_no)

    result = [
        {
            "district": district,
            "roads": [{"road": road, "spots": spots} for road, spots in roads.items()],
        }
        for district, roads in districts.items()
    ]
    return {"districts": result}


# --------------------------------------------------------------------------
# QR scan -> resolve ticket data from the (external) query site
# --------------------------------------------------------------------------
@app.post("/api/qr/scan")
def scan_qr(payload: dict, principal: Principal = Depends(require_inspector)):
    """Resolve a scanned QR code into ticket data.

    `qr_code` is the raw decoded QR content: either a built-in demo code
    (QR-A1001 ...) or a real URL to the query site. See app/qr_service.py for
    the resolution + SSRF rules.
    """
    return qr_service.resolve((payload or {}).get("qr_code", ""))


# A local stand-in for the external '查詢網站', so the real fetch-and-parse path
# can be exercised end to end without a live government endpoint. Serves a
# realistic labeled HTML ticket page. Disabled by QR_MOCK_SITE_ENABLED=false.
# To use it, point QR_QUERY_ALLOWED_HOSTS at this host (e.g. localhost) and have
# a demo QR encode e.g. http://localhost:8000/mock-qr-site/A1004
_MOCK_LABELS = [
    ("ticket_no", "帳單編號"),
    ("plate_no", "車牌號碼"),
    ("amount", "應繳金額"),
    ("due_date", "繳費期限"),
    ("parking_date", "停車日期"),
    ("parking_start", "停車開始時間"),
    ("parking_end", "停車結束時間"),
]


@app.get("/mock-qr-site/{token}", response_class=HTMLResponse)
def mock_qr_site(token: str):
    if not settings.qr_mock_site_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    entry = QR_DEMO_CODES.get(f"QR-{token}")
    if not entry or entry.get("type") != "success":
        raise HTTPException(status_code=404, detail="查無此停車單")
    rows = "".join(
        f"<p><strong>{label}：</strong>{entry[key]}</p>"
        for key, label in _MOCK_LABELS
        if key in entry
    )
    html = (
        "<!doctype html><html lang='zh-Hant'><head><meta charset='utf-8'>"
        "<title>停車單查詢</title></head><body>"
        "<h1>停車單查詢結果</h1>" + rows + "</body></html>"
    )
    return HTMLResponse(content=html)


# --------------------------------------------------------------------------
# Case preview / judgement
# --------------------------------------------------------------------------
def _current_overdue_threshold(db: Session) -> float:
    value = get_setting(db, "overdue_threshold_minutes", str(rules.DEFAULT_OVERDUE_THRESHOLD_MINUTES))
    try:
        return float(value)
    except (TypeError, ValueError):
        return rules.DEFAULT_OVERDUE_THRESHOLD_MINUTES


def _run_judgement(db: Session, ticket_no: str, parking_date_str: str, parking_start_str: str):
    """Returns (judgement_dict, error_message_or_none)."""
    try:
        parsed = rules.parse_ticket_no(ticket_no)
    except rules.TicketParseError as exc:
        return None, str(exc)

    try:
        parking_date = date.fromisoformat(parking_date_str)
        parking_start = datetime.fromisoformat(parking_start_str)
    except ValueError as exc:
        return None, f"日期/時間格式錯誤：{exc}"

    issue_dt = rules.compute_issue_datetime(parking_date, parsed)
    threshold = _current_overdue_threshold(db)
    result = rules.judge_time_diff(issue_dt, parking_start, threshold_minutes=threshold)

    return {
        "issue_datetime": result.issue_datetime.isoformat(),
        "time_diff_minutes": result.time_diff_minutes,
        "judgement": result.judgement,
        "inspector_code": parsed.inspector_code,
        "overdue_threshold_minutes": threshold,
    }, None


@app.post("/api/cases/preview")
def preview_case(
    payload: CasePreviewRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_inspector),
):
    judgement, error = _run_judgement(
        db, payload.ticket_no, payload.parking_date, payload.parking_start
    )
    if error:
        return {"judgement": "PARSE_ERROR", "error": error}
    return judgement


# --------------------------------------------------------------------------
# Case save
# --------------------------------------------------------------------------
@app.post("/api/cases")
def create_case(
    payload: CaseCreateRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_inspector),
):
    judgement, error = _run_judgement(
        db, payload.ticket_no, payload.parking_date, payload.parking_start
    )

    if error:
        judgement_value = "PARSE_ERROR"
        issue_datetime = None
        time_diff_minutes = None
    else:
        judgement_value = judgement["judgement"]
        issue_datetime = judgement["issue_datetime"]
        time_diff_minutes = judgement["time_diff_minutes"]

    existing = db.scalar(
        select(Case).where(Case.ticket_no == payload.ticket_no).order_by(Case.id)
    )
    duplicate_warning = existing is not None

    if duplicate_warning and not payload.save_anyway:
        raise HTTPException(
            status_code=409,
            detail={
                "duplicate": True,
                "message": "帳單編號已存在，是否仍要儲存？",
                "existing_case": {
                    "id": existing.id,
                    "district": existing.district,
                    "road": existing.road,
                    "spot_no": existing.spot_no,
                    "inspector_username": existing.inspector_username,
                    "created_at": existing.created_at,
                    "status": existing.status,
                },
            },
        )

    review_required = bool(
        judgement_value in ("OVERDUE", "DATA_ERROR", "PARSE_ERROR")
        or payload.data_source in ("MANUAL_FROM_QR_PAGE", "MANUAL_FROM_TICKET")
        or payload.manual_corrected
        or duplicate_warning
    )
    status = "REVIEW_REQUIRED" if review_required else "CLOSED"

    photo_path = None
    if payload.photo_base64:
        ext = "jpg"
        if payload.photo_filename and "." in payload.photo_filename:
            ext = payload.photo_filename.rsplit(".", 1)[-1][:5]
        filename = f"{uuid.uuid4().hex}.{ext}"
        raw = payload.photo_base64.split(",")[-1]  # strip data: prefix if present
        (UPLOADS_DIR / filename).write_bytes(base64.b64decode(raw))
        photo_path = f"/uploads/{filename}"

    case = Case(
        ticket_no=payload.ticket_no,
        district=payload.district,
        road=payload.road,
        spot_no=payload.spot_no,
        gps_lat=payload.gps_lat,
        gps_lng=payload.gps_lng,
        plate_no=payload.plate_no,
        amount=payload.amount,
        due_date=payload.due_date,
        parking_date=payload.parking_date,
        parking_start=payload.parking_start,
        parking_end=payload.parking_end,
        data_source=payload.data_source,
        manual_corrected=int(payload.manual_corrected),
        original_values=json.dumps(payload.original_values, ensure_ascii=False)
        if payload.original_values
        else None,
        # Trust the authenticated identity, not the client-supplied username.
        inspector_username=principal.username,
        issue_datetime=issue_datetime,
        time_diff_minutes=time_diff_minutes,
        judgement=judgement_value,
        review_required=int(review_required),
        duplicate_warning=int(duplicate_warning),
        photo_path=photo_path,
        status=status,
        synced_offline=int(payload.offline_submitted),
        created_at=datetime.now().isoformat(timespec="seconds"),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return row_to_dict(case)


@app.get("/api/cases")
def list_cases(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_inspector),
):
    # Scoped to the authenticated inspector's own submissions - the caller can
    # no longer read another inspector's cases by passing ?username=.
    rows = db.scalars(
        select(Case)
        .where(Case.inspector_username == principal.username)
        .order_by(Case.id.desc())
    ).all()
    return [row_to_dict(r) for r in rows]


@app.get("/api/health")
def health():
    return {"ok": True}


# ==========================================================================
# Admin console API
# ==========================================================================

REVIEW_OUTCOMES = {"DATA_ERROR", "DUPLICATE", "NEED_INFO", "CONFIRMED", "DISMISSED"}


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest, db: Session = Depends(get_db)):
    row = db.scalar(select(AdminUser).where(AdminUser.username == payload.username))

    if row is None or not verify_password(payload.password, row.password):
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    return {
        "token": create_access_token(row.username, row.role),
        "admin": {
            "username": row.username,
            "display_name": row.display_name,
            "role": row.role,
        },
    }


@app.get("/api/admin/cases")
def admin_list_cases(
    status: Optional[str] = None,
    judgement: Optional[str] = None,
    duplicate_warning: Optional[bool] = None,
    review_required: Optional[bool] = None,
    district: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_manager),
):
    stmt = select(Case)

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            stmt = stmt.where(Case.status.in_(statuses))
    if judgement:
        stmt = stmt.where(Case.judgement == judgement)
    if duplicate_warning is not None:
        stmt = stmt.where(Case.duplicate_warning == int(duplicate_warning))
    if review_required is not None:
        stmt = stmt.where(Case.review_required == int(review_required))
    if district:
        stmt = stmt.where(Case.district == district)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Case.ticket_no.like(like), Case.plate_no.like(like)))

    stmt = stmt.order_by(Case.id.desc()).limit(500)
    rows = db.scalars(stmt).all()
    return [row_to_dict(r) for r in rows]


@app.get("/api/admin/cases/{case_id}")
def admin_get_case(
    case_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_manager),
):
    row = db.get(Case, case_id)
    if not row:
        raise HTTPException(status_code=404, detail="案件不存在")
    return row_to_dict(row)


@app.post("/api/admin/cases/{case_id}/review")
def admin_review_case(
    case_id: int,
    payload: ReviewRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_manager),
):
    if payload.outcome not in REVIEW_OUTCOMES:
        raise HTTPException(status_code=400, detail=f"未知的複核結果：{payload.outcome}")

    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="案件不存在")
    if case.status not in ("REVIEW_REQUIRED", "REVIEW_NEED_INFO"):
        raise HTTPException(
            status_code=400, detail=f"案件目前狀態為 {case.status}，不在待複核佇列中"
        )

    # NEED_INFO keeps the case open (mirrors REVIEW_REQUIRED ->
    # REVIEW_NEED_INFO in the state diagram); every other outcome closes it.
    new_status = "REVIEW_NEED_INFO" if payload.outcome == "NEED_INFO" else "CLOSED"

    case.review_outcome = payload.outcome
    case.review_note = payload.note
    # Record the authenticated admin as the reviewer, not a client-supplied name.
    case.reviewed_by = principal.username
    case.reviewed_at = datetime.now().isoformat(timespec="seconds")
    case.status = new_status
    db.commit()
    db.refresh(case)
    return row_to_dict(case)


@app.get("/api/admin/stats")
def admin_stats(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_manager),
):
    total = db.scalar(select(func.count()).select_from(Case)) or 0

    by_judgement = {
        (j or "UNKNOWN"): c
        for j, c in db.execute(
            select(Case.judgement, func.count()).group_by(Case.judgement)
        ).all()
    }
    by_status = {
        s: c
        for s, c in db.execute(select(Case.status, func.count()).group_by(Case.status)).all()
    }
    by_data_source = {
        ds: c
        for ds, c in db.execute(
            select(Case.data_source, func.count()).group_by(Case.data_source)
        ).all()
    }
    by_district = {
        (d or "未知"): c
        for d, c in db.execute(
            select(Case.district, func.count()).group_by(Case.district)
        ).all()
    }
    duplicate_count = db.scalar(
        select(func.count()).select_from(Case).where(Case.duplicate_warning == 1)
    ) or 0
    review_pending = db.scalar(
        select(func.count())
        .select_from(Case)
        .where(Case.status.in_(("REVIEW_REQUIRED", "REVIEW_NEED_INFO")))
    ) or 0
    avg_raw = db.scalar(
        select(func.avg(Case.time_diff_minutes)).where(Case.time_diff_minutes.is_not(None))
    )
    avg_time_diff = round(avg_raw, 1) if avg_raw is not None else None
    overdue = by_judgement.get("OVERDUE", 0)
    judged_total = sum(by_judgement.values())
    overdue_rate = round(overdue / judged_total * 100, 1) if judged_total else 0.0

    return {
        "total": total,
        "by_judgement": by_judgement,
        "by_status": by_status,
        "by_data_source": by_data_source,
        "by_district": by_district,
        "duplicate_count": duplicate_count,
        "review_pending": review_pending,
        "avg_time_diff_minutes": avg_time_diff,
        "overdue_rate_pct": overdue_rate,
    }


CSV_COLUMNS = [
    "id", "ticket_no", "district", "road", "spot_no", "gps_lat", "gps_lng",
    "plate_no", "amount", "due_date",
    "parking_date", "parking_start", "parking_end", "data_source", "manual_corrected",
    "inspector_username", "issue_datetime", "time_diff_minutes", "judgement",
    "review_required", "duplicate_warning", "status", "review_outcome", "review_note",
    "reviewed_by", "reviewed_at", "synced_offline", "created_at",
]


@app.get("/api/admin/export.csv")
def admin_export_csv(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_manager),
):
    rows = db.scalars(select(Case).order_by(Case.id)).all()

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(row_to_dict(r))
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=parking_cases_export.csv"},
    )


@app.get("/api/admin/inspectors")
def admin_list_inspectors(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    rows = db.scalars(select(Inspector).order_by(Inspector.username)).all()
    # Never expose the password hash.
    return [
        {
            "username": r.username,
            "display_name": r.display_name,
            "has_permission": r.has_permission,
        }
        for r in rows
    ]


@app.post("/api/admin/inspectors")
def admin_create_inspector(
    payload: InspectorCreateRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    existing = db.scalar(select(Inspector).where(Inspector.username == payload.username))
    if existing:
        raise HTTPException(status_code=409, detail="帳號已存在")
    db.add(
        Inspector(
            username=payload.username,
            password=hash_password(payload.password),
            display_name=payload.display_name,
            has_permission=int(payload.has_permission),
        )
    )
    db.commit()
    return {
        "username": payload.username,
        "display_name": payload.display_name,
        "has_permission": payload.has_permission,
    }


@app.patch("/api/admin/inspectors/{username}")
def admin_update_inspector(
    username: str,
    payload: InspectorUpdateRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    row = db.scalar(select(Inspector).where(Inspector.username == username))
    if not row:
        raise HTTPException(status_code=404, detail="帳號不存在")

    if payload.display_name is not None:
        row.display_name = payload.display_name
    if payload.has_permission is not None:
        row.has_permission = int(payload.has_permission)
    if payload.password is not None:
        row.password = hash_password(payload.password)
    db.commit()
    db.refresh(row)

    return {
        "username": row.username,
        "display_name": row.display_name,
        "has_permission": row.has_permission,
    }


@app.get("/api/admin/locations")
def admin_list_locations(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    rows = db.scalars(
        select(Location).order_by(Location.district, Location.road, Location.spot_no)
    ).all()
    return [row_to_dict(r) for r in rows]


@app.post("/api/admin/locations")
def admin_create_location(
    payload: LocationCreateRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    existing = db.scalar(
        select(Location).where(
            Location.district == payload.district,
            Location.road == payload.road,
            Location.spot_no == payload.spot_no,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="此停車格已存在")
    location = Location(district=payload.district, road=payload.road, spot_no=payload.spot_no)
    db.add(location)
    db.commit()
    db.refresh(location)
    return {
        "id": location.id,
        "district": location.district,
        "road": location.road,
        "spot_no": location.spot_no,
    }


@app.delete("/api/admin/locations/{location_id}")
def admin_delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="找不到該筆資料")
    db.delete(location)
    db.commit()
    return {"ok": True}


@app.get("/api/admin/settings")
def admin_get_settings(
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    return {"overdue_threshold_minutes": _current_overdue_threshold(db)}


@app.put("/api/admin/settings")
def admin_update_settings(
    payload: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    principal: Principal = Depends(require_sysadmin),
):
    if payload.overdue_threshold_minutes <= 0:
        raise HTTPException(status_code=400, detail="門檻必須大於 0")
    set_setting(db, "overdue_threshold_minutes", str(payload.overdue_threshold_minutes))
    db.commit()
    return {"overdue_threshold_minutes": payload.overdue_threshold_minutes}
