"""Admin Excel import: templates, bulk locations/inspectors, RBAC."""
from __future__ import annotations

import io

from openpyxl import Workbook
from tests.conftest import auth


def _build_xlsx(rows: list[list]) -> bytes:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_import_template_locations(client, sysadmin_token):
    res = client.get("/api/admin/import/templates/locations", headers=auth(sysadmin_token))
    assert res.status_code == 200
    assert "spreadsheetml" in res.headers["content-type"]
    assert "parking_locations_import_template.xlsx" in res.headers["content-disposition"]


def test_import_template_inspectors(client, sysadmin_token):
    res = client.get("/api/admin/import/templates/inspectors", headers=auth(sysadmin_token))
    assert res.status_code == 200
    assert "parking_inspectors_import_template.xlsx" in res.headers["content-disposition"]


def test_import_template_rejects_manager(client, manager_token):
    res = client.get("/api/admin/import/templates/locations", headers=auth(manager_token))
    assert res.status_code == 403


def test_import_unknown_type(client, sysadmin_token):
    res = client.get("/api/admin/import/templates/cases", headers=auth(sysadmin_token))
    assert res.status_code == 400


def test_import_locations_success_and_skip_duplicate(client, sysadmin_token):
    xlsx = _build_xlsx([
        ["行政區", "路段", "停車格編號"],
        ["信義區", "松高路", "IMP-001"],
        ["信義區", "松高路", "IMP-001"],  # duplicate row -> skipped
        ["大安區", "敦化南路", "IMP-002"],
    ])
    res = client.post(
        "/api/admin/import/locations",
        headers=auth(sysadmin_token),
        files={"file": ("spots.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["import_type"] == "locations"
    assert body["total_rows"] == 3
    assert body["created"] == 2
    assert body["skipped"] == 1
    assert body["errors"] == []

    listed = client.get("/api/admin/locations", headers=auth(sysadmin_token)).json()
    spots = {(r["district"], r["road"], r["spot_no"]) for r in listed}
    assert ("信義區", "松高路", "IMP-001") in spots
    assert ("大安區", "敦化南路", "IMP-002") in spots


def test_import_locations_validation_errors(client, sysadmin_token):
    xlsx = _build_xlsx([
        ["行政區", "路段", "停車格編號"],
        ["", "松高路", "BAD-001"],
        ["大安區", "敦化南路", "BAD-002"],
    ])
    res = client.post(
        "/api/admin/import/locations",
        headers=auth(sysadmin_token),
        files={"file": ("spots.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] == 1
    assert body["errors"] == [{"row": 2, "message": "行政區、路段、停車格編號皆為必填"}]


def test_import_locations_rejects_non_xlsx(client, sysadmin_token):
    res = client.post(
        "/api/admin/import/locations",
        headers=auth(sysadmin_token),
        files={"file": ("spots.csv", b"a,b,c", "text/csv")},
    )
    assert res.status_code == 400


def test_import_inspectors_success(client, sysadmin_token):
    xlsx = _build_xlsx([
        ["帳號", "密碼", "姓名", "啟用權限"],
        ["imp_x1", "secret1", "匯入員一", "是"],
        ["imp_x2", "secret2", "匯入員二", "否"],
    ])
    res = client.post(
        "/api/admin/import/inspectors",
        headers=auth(sysadmin_token),
        files={"file": ("inspectors.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] == 2
    assert body["skipped"] == 0

    listed = client.get("/api/admin/inspectors", headers=auth(sysadmin_token)).json()
    by_name = {r["username"]: r for r in listed}
    assert by_name["imp_x1"]["has_permission"] == 1
    assert by_name["imp_x2"]["has_permission"] == 0

    login = client.post("/api/login", json={"username": "imp_x1", "password": "secret1"})
    assert login.status_code == 200


def test_import_inspectors_skip_existing(client, sysadmin_token):
    xlsx = _build_xlsx([
        ["帳號", "密碼", "姓名"],
        ["insp01", "newpass", "重複帳號"],
    ])
    res = client.post(
        "/api/admin/import/inspectors",
        headers=auth(sysadmin_token),
        files={"file": ("inspectors.xlsx", xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] == 0
    assert body["skipped"] == 1
