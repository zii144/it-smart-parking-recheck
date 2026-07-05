"""FastAPI backend for the parking-ticket inspection prototype.

Two front ends share this one API:
  - the inspector-facing mobile flow (/api/... - login, locations, qr scan,
    case preview/save)
  - the admin console (/api/admin/... - review queue, case search, stats,
    CSV export, inspector accounts, locations, system settings)

It's a real backend with a real SQLite database (not an in-memory mock), so
the business rules and persistence are genuinely exercised end to end -
including the overdue threshold, which the admin "系統設定" tab can change
and which immediately affects how new/re-reviewed cases are judged.

Endpoints:
  POST /api/login                    - inspector login (also returns has_permission)
  GET  /api/locations                - district/road/parking-spot picklist (DB-backed)
  POST /api/qr/scan                  - simulated QR-code lookup (see app/seed.py)
  POST /api/cases/preview            - run parsing + judgement without saving
  POST /api/cases                    - authoritative save (re-parses, re-judges,
                                        checks duplicates, stores photo + record)
  GET  /api/cases                    - list saved cases (inspector's own "my
                                        submissions" screen)

  POST /api/admin/login               - admin console login
  GET  /api/admin/cases               - filtered case query (status/judgement/
                                         duplicate/district/text search)
  GET  /api/admin/cases/{id}          - single case detail
  POST /api/admin/cases/{id}/review   - record a review decision (see
                                        REVIEW_OUTCOMES below)
  GET  /api/admin/stats               - aggregate statistics
  GET  /api/admin/export.csv          - CSV export of all cases
  GET  /api/admin/inspectors          - list inspector accounts
  POST /api/admin/inspectors          - create an inspector account
  PATCH /api/admin/inspectors/{username} - update permission/name/password
  GET  /api/admin/locations           - flat list of parking spots
  POST /api/admin/locations           - add a parking spot
  DELETE /api/admin/locations/{id}    - remove a parking spot
  GET  /api/admin/settings            - current system settings
  PUT  /api/admin/settings            - update system settings
"""
from __future__ import annotations

import base64
import csv
import io
import json
import os
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import business_rules as rules
from .db import find_case_by_ticket_no, get_connection, get_setting, init_db, set_setting
from .seed import QR_DEMO_CODES, seed

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = Path(os.environ.get("PARKING_UPLOADS_DIR", str(BASE_DIR / "uploads")))
UPLOADS_DIR.mkdir(exist_ok=True, parents=True)

app = FastAPI(title="Parking Ticket Inspection Prototype API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # prototype only - tighten before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.on_event("startup")
def _startup() -> None:
    init_db()
    seed()


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
def login(payload: LoginRequest):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM inspectors WHERE username = ?", (payload.username,)
        ).fetchone()
    finally:
        conn.close()

    if row is None or row["password"] != payload.password:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    return {
        "token": base64.b64encode(payload.username.encode()).decode(),
        "inspector": {
            "username": row["username"],
            "display_name": row["display_name"],
            "has_permission": bool(row["has_permission"]),
        },
    }


# --------------------------------------------------------------------------
# Locations (DB-backed so the admin console's "路段管理" tab can edit them)
# --------------------------------------------------------------------------
@app.get("/api/locations")
def get_locations():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT district, road, spot_no FROM locations ORDER BY district, road, spot_no"
        ).fetchall()
    finally:
        conn.close()

    districts: dict[str, dict[str, list[str]]] = {}
    for r in rows:
        roads = districts.setdefault(r["district"], {})
        roads.setdefault(r["road"], []).append(r["spot_no"])

    result = [
        {
            "district": district,
            "roads": [{"road": road, "spots": spots} for road, spots in roads.items()],
        }
        for district, roads in districts.items()
    ]
    return {"districts": result}


# --------------------------------------------------------------------------
# Simulated QR scan
# --------------------------------------------------------------------------
@app.post("/api/qr/scan")
def scan_qr(payload: dict):
    qr_code = (payload or {}).get("qr_code", "")
    entry = QR_DEMO_CODES.get(qr_code)

    if entry is None:
        return {"status": "scan_failed"}

    if entry["type"] == "success":
        return {"status": "success", "ticket": {k: v for k, v in entry.items() if k not in ("type", "note")}}

    if entry["type"] == "fetch_failed":
        return {
            "status": "fetch_failed",
            "query_url": entry["query_url"],
            "page_preview": entry["page_preview"],
        }

    return {"status": "scan_failed"}


# --------------------------------------------------------------------------
# Case preview / judgement
# --------------------------------------------------------------------------
def _current_overdue_threshold(conn) -> float:
    value = get_setting(conn, "overdue_threshold_minutes", str(rules.DEFAULT_OVERDUE_THRESHOLD_MINUTES))
    try:
        return float(value)
    except (TypeError, ValueError):
        return rules.DEFAULT_OVERDUE_THRESHOLD_MINUTES


def _run_judgement(conn, ticket_no: str, parking_date_str: str, parking_start_str: str):
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
    threshold = _current_overdue_threshold(conn)
    result = rules.judge_time_diff(issue_dt, parking_start, threshold_minutes=threshold)

    return {
        "issue_datetime": result.issue_datetime.isoformat(),
        "time_diff_minutes": result.time_diff_minutes,
        "judgement": result.judgement,
        "inspector_code": parsed.inspector_code,
        "overdue_threshold_minutes": threshold,
    }, None


@app.post("/api/cases/preview")
def preview_case(payload: CasePreviewRequest):
    conn = get_connection()
    try:
        judgement, error = _run_judgement(
            conn, payload.ticket_no, payload.parking_date, payload.parking_start
        )
    finally:
        conn.close()
    if error:
        return {"judgement": "PARSE_ERROR", "error": error}
    return judgement


# --------------------------------------------------------------------------
# Case save
# --------------------------------------------------------------------------
@app.post("/api/cases")
def create_case(payload: CaseCreateRequest):
    conn = get_connection()
    try:
        judgement, error = _run_judgement(
            conn, payload.ticket_no, payload.parking_date, payload.parking_start
        )

        if error:
            judgement_value = "PARSE_ERROR"
            issue_datetime = None
            time_diff_minutes = None
        else:
            judgement_value = judgement["judgement"]
            issue_datetime = judgement["issue_datetime"]
            time_diff_minutes = judgement["time_diff_minutes"]

        existing = find_case_by_ticket_no(conn, payload.ticket_no)
        duplicate_warning = existing is not None

        if duplicate_warning and not payload.save_anyway:
            raise HTTPException(
                status_code=409,
                detail={
                    "duplicate": True,
                    "message": "帳單編號已存在，是否仍要儲存？",
                    "existing_case": {
                        "id": existing["id"],
                        "district": existing["district"],
                        "road": existing["road"],
                        "spot_no": existing["spot_no"],
                        "inspector_username": existing["inspector_username"],
                        "created_at": existing["created_at"],
                        "status": existing["status"],
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

        cur = conn.execute(
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
                :manual_corrected, :original_values, :inspector_username,
                :issue_datetime, :time_diff_minutes, :judgement, :review_required,
                :duplicate_warning, :photo_path, :status, :synced_offline, :created_at
            )
            """,
            {
                "ticket_no": payload.ticket_no,
                "district": payload.district,
                "road": payload.road,
                "spot_no": payload.spot_no,
                "plate_no": payload.plate_no,
                "amount": payload.amount,
                "due_date": payload.due_date,
                "parking_date": payload.parking_date,
                "parking_start": payload.parking_start,
                "parking_end": payload.parking_end,
                "data_source": payload.data_source,
                "manual_corrected": int(payload.manual_corrected),
                "original_values": json.dumps(payload.original_values, ensure_ascii=False)
                if payload.original_values
                else None,
                "inspector_username": payload.inspector_username,
                "issue_datetime": issue_datetime,
                "time_diff_minutes": time_diff_minutes,
                "judgement": judgement_value,
                "review_required": int(review_required),
                "duplicate_warning": int(duplicate_warning),
                "photo_path": photo_path,
                "status": status,
                "synced_offline": int(payload.offline_submitted),
                "created_at": datetime.now().isoformat(timespec="seconds"),
            },
        )
        conn.commit()
        case_id = cur.lastrowid
        saved = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        return dict(saved)
    finally:
        conn.close()


@app.get("/api/cases")
def list_cases(username: Optional[str] = None):
    conn = get_connection()
    try:
        if username:
            rows = conn.execute(
                "SELECT * FROM cases WHERE inspector_username = ? ORDER BY id DESC", (username,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM cases ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/health")
def health():
    return {"ok": True}


# ==========================================================================
# Admin console API
# ==========================================================================

REVIEW_OUTCOMES = {"DATA_ERROR", "DUPLICATE", "NEED_INFO", "CONFIRMED", "DISMISSED"}


@app.post("/api/admin/login")
def admin_login(payload: AdminLoginRequest):
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM admin_users WHERE username = ?", (payload.username,)
        ).fetchone()
    finally:
        conn.close()

    if row is None or row["password"] != payload.password:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")

    return {
        "token": base64.b64encode(f"admin:{payload.username}".encode()).decode(),
        "admin": {"username": row["username"], "display_name": row["display_name"]},
    }


@app.get("/api/admin/cases")
def admin_list_cases(
    status: Optional[str] = None,
    judgement: Optional[str] = None,
    duplicate_warning: Optional[bool] = None,
    review_required: Optional[bool] = None,
    district: Optional[str] = None,
    q: Optional[str] = None,
):
    conditions = []
    params: dict = {}

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        placeholders = ", ".join(f":status{i}" for i in range(len(statuses)))
        conditions.append(f"status IN ({placeholders})")
        for i, s in enumerate(statuses):
            params[f"status{i}"] = s
    if judgement:
        conditions.append("judgement = :judgement")
        params["judgement"] = judgement
    if duplicate_warning is not None:
        conditions.append("duplicate_warning = :duplicate_warning")
        params["duplicate_warning"] = int(duplicate_warning)
    if review_required is not None:
        conditions.append("review_required = :review_required")
        params["review_required"] = int(review_required)
    if district:
        conditions.append("district = :district")
        params["district"] = district
    if q:
        conditions.append("(ticket_no LIKE :q OR plate_no LIKE :q)")
        params["q"] = f"%{q}%"

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    conn = get_connection()
    try:
        rows = conn.execute(f"SELECT * FROM cases {where} ORDER BY id DESC LIMIT 500", params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/admin/cases/{case_id}")
def admin_get_case(case_id: int):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="案件不存在")
    return dict(row)


@app.post("/api/admin/cases/{case_id}/review")
def admin_review_case(case_id: int, payload: ReviewRequest):
    if payload.outcome not in REVIEW_OUTCOMES:
        raise HTTPException(status_code=400, detail=f"未知的複核結果：{payload.outcome}")

    conn = get_connection()
    try:
        case = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        if not case:
            raise HTTPException(status_code=404, detail="案件不存在")
        if case["status"] not in ("REVIEW_REQUIRED", "REVIEW_NEED_INFO"):
            raise HTTPException(
                status_code=400, detail=f"案件目前狀態為 {case['status']}，不在待複核佇列中"
            )

        # NEED_INFO keeps the case open (mirrors REVIEW_REQUIRED ->
        # REVIEW_NEED_INFO in the state diagram); every other outcome closes
        # it (all five review-outcome boxes converge on CLOSED).
        new_status = "REVIEW_NEED_INFO" if payload.outcome == "NEED_INFO" else "CLOSED"

        conn.execute(
            """
            UPDATE cases
            SET review_outcome = :outcome, review_note = :note, reviewed_by = :reviewed_by,
                reviewed_at = :reviewed_at, status = :status
            WHERE id = :id
            """,
            {
                "outcome": payload.outcome,
                "note": payload.note,
                "reviewed_by": payload.reviewed_by,
                "reviewed_at": datetime.now().isoformat(timespec="seconds"),
                "status": new_status,
                "id": case_id,
            },
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM cases WHERE id = ?", (case_id,)).fetchone()
        return dict(updated)
    finally:
        conn.close()


@app.get("/api/admin/stats")
def admin_stats():
    conn = get_connection()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM cases").fetchone()["c"]
        by_judgement = {
            (r["judgement"] or "UNKNOWN"): r["c"]
            for r in conn.execute("SELECT judgement, COUNT(*) c FROM cases GROUP BY judgement")
        }
        by_status = {
            r["status"]: r["c"] for r in conn.execute("SELECT status, COUNT(*) c FROM cases GROUP BY status")
        }
        by_data_source = {
            r["data_source"]: r["c"]
            for r in conn.execute("SELECT data_source, COUNT(*) c FROM cases GROUP BY data_source")
        }
        by_district = {
            (r["district"] or "未知"): r["c"]
            for r in conn.execute("SELECT district, COUNT(*) c FROM cases GROUP BY district")
        }
        duplicate_count = conn.execute(
            "SELECT COUNT(*) c FROM cases WHERE duplicate_warning = 1"
        ).fetchone()["c"]
        review_pending = conn.execute(
            "SELECT COUNT(*) c FROM cases WHERE status IN ('REVIEW_REQUIRED', 'REVIEW_NEED_INFO')"
        ).fetchone()["c"]
        avg_row = conn.execute(
            "SELECT AVG(time_diff_minutes) a FROM cases WHERE time_diff_minutes IS NOT NULL"
        ).fetchone()
        avg_time_diff = round(avg_row["a"], 1) if avg_row["a"] is not None else None
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
    finally:
        conn.close()


CSV_COLUMNS = [
    "id", "ticket_no", "district", "road", "spot_no", "plate_no", "amount", "due_date",
    "parking_date", "parking_start", "parking_end", "data_source", "manual_corrected",
    "inspector_username", "issue_datetime", "time_diff_minutes", "judgement",
    "review_required", "duplicate_warning", "status", "review_outcome", "review_note",
    "reviewed_by", "reviewed_at", "synced_offline", "created_at",
]


@app.get("/api/admin/export.csv")
def admin_export_csv():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM cases ORDER BY id").fetchall()
    finally:
        conn.close()

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(dict(r))
    buf.seek(0)

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=parking_cases_export.csv"},
    )


@app.get("/api/admin/inspectors")
def admin_list_inspectors():
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT username, display_name, has_permission FROM inspectors ORDER BY username"
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/admin/inspectors")
def admin_create_inspector(payload: InspectorCreateRequest):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT 1 FROM inspectors WHERE username = ?", (payload.username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="帳號已存在")
        conn.execute(
            "INSERT INTO inspectors (username, password, display_name, has_permission) VALUES (?, ?, ?, ?)",
            (payload.username, payload.password, payload.display_name, int(payload.has_permission)),
        )
        conn.commit()
        return {"username": payload.username, "display_name": payload.display_name, "has_permission": payload.has_permission}
    finally:
        conn.close()


@app.patch("/api/admin/inspectors/{username}")
def admin_update_inspector(username: str, payload: InspectorUpdateRequest):
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM inspectors WHERE username = ?", (username,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="帳號不存在")

        updates: dict = {}
        if payload.display_name is not None:
            updates["display_name"] = payload.display_name
        if payload.has_permission is not None:
            updates["has_permission"] = int(payload.has_permission)
        if payload.password is not None:
            updates["password"] = payload.password

        if updates:
            set_clause = ", ".join(f"{k} = :{k}" for k in updates)
            updates["username"] = username
            conn.execute(f"UPDATE inspectors SET {set_clause} WHERE username = :username", updates)
            conn.commit()

        updated = conn.execute(
            "SELECT username, display_name, has_permission FROM inspectors WHERE username = ?", (username,)
        ).fetchone()
        return dict(updated)
    finally:
        conn.close()


@app.get("/api/admin/locations")
def admin_list_locations():
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM locations ORDER BY district, road, spot_no").fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/admin/locations")
def admin_create_location(payload: LocationCreateRequest):
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT 1 FROM locations WHERE district = ? AND road = ? AND spot_no = ?",
            (payload.district, payload.road, payload.spot_no),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="此停車格已存在")
        cur = conn.execute(
            "INSERT INTO locations (district, road, spot_no) VALUES (?, ?, ?)",
            (payload.district, payload.road, payload.spot_no),
        )
        conn.commit()
        return {"id": cur.lastrowid, "district": payload.district, "road": payload.road, "spot_no": payload.spot_no}
    finally:
        conn.close()


@app.delete("/api/admin/locations/{location_id}")
def admin_delete_location(location_id: int):
    conn = get_connection()
    try:
        cur = conn.execute("DELETE FROM locations WHERE id = ?", (location_id,))
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="找不到該筆資料")
        return {"ok": True}
    finally:
        conn.close()


@app.get("/api/admin/settings")
def admin_get_settings():
    conn = get_connection()
    try:
        threshold = _current_overdue_threshold(conn)
        return {"overdue_threshold_minutes": threshold}
    finally:
        conn.close()


@app.put("/api/admin/settings")
def admin_update_settings(payload: SettingsUpdateRequest):
    if payload.overdue_threshold_minutes <= 0:
        raise HTTPException(status_code=400, detail="門檻必須大於 0")
    conn = get_connection()
    try:
        set_setting(conn, "overdue_threshold_minutes", str(payload.overdue_threshold_minutes))
        conn.commit()
        return {"overdue_threshold_minutes": payload.overdue_threshold_minutes}
    finally:
        conn.close()
