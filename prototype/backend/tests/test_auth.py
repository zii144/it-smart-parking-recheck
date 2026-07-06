"""Goals 2 & 3 - JWT issuance and enforced authorization on every route."""
from __future__ import annotations

from tests.conftest import auth, make_token


# --- login ----------------------------------------------------------------
def test_inspector_login_success_returns_jwt(client):
    res = client.post("/api/login", json={"username": "insp01", "password": "pass123"})
    assert res.status_code == 200
    body = res.json()
    # 3-segment JWT, not the old base64(username).
    assert body["token"].count(".") == 2
    assert body["inspector"]["username"] == "insp01"
    assert body["inspector"]["has_permission"] is True


def test_login_wrong_password_401(client):
    res = client.post("/api/login", json={"username": "insp01", "password": "nope"})
    assert res.status_code == 401


def test_login_unknown_user_401(client):
    res = client.post("/api/login", json={"username": "ghost", "password": "x"})
    assert res.status_code == 401


def test_manager_login_success_carries_role(client):
    res = client.post("/api/admin/login", json={"username": "manager01", "password": "manager123"})
    assert res.status_code == 200
    assert res.json()["admin"]["username"] == "manager01"
    assert res.json()["admin"]["role"] == "manager"


def test_sysadmin_login_success_carries_role(client):
    res = client.post("/api/admin/login", json={"username": "sysadmin01", "password": "sysadmin123"})
    assert res.status_code == 200
    assert res.json()["admin"]["role"] == "sysadmin"


# --- enforcement: no/garbage/expired token --------------------------------
def test_protected_route_without_token_is_401(client):
    assert client.get("/api/locations").status_code == 401


def test_admin_route_without_token_is_401(client):
    assert client.get("/api/admin/stats").status_code == 401


def test_garbage_token_is_401(client):
    res = client.get("/api/locations", headers=auth("not.a.jwt"))
    assert res.status_code == 401


def test_expired_token_is_401(client):
    token = make_token("insp01", "inspector", expired=True)
    res = client.get("/api/locations", headers=auth(token))
    assert res.status_code == 401


def test_health_is_public(client):
    assert client.get("/api/health").status_code == 200


# --- role separation (all directions) -------------------------------------
def test_inspector_can_reach_inspector_route(client, inspector_token):
    assert client.get("/api/locations", headers=auth(inspector_token)).status_code == 200


def test_inspector_token_rejected_on_admin_route_403(client, inspector_token):
    assert client.get("/api/admin/stats", headers=auth(inspector_token)).status_code == 403


def test_manager_token_rejected_on_inspector_route_403(client, manager_token):
    # An admin token must not be usable as an inspector.
    assert client.get("/api/locations", headers=auth(manager_token)).status_code == 403


def test_manager_can_reach_manager_route(client, manager_token):
    assert client.get("/api/admin/stats", headers=auth(manager_token)).status_code == 200


def test_manager_cannot_reach_sysadmin_route(client, manager_token):
    # 管理人員 must not manage accounts/locations/settings.
    assert client.get("/api/admin/settings", headers=auth(manager_token)).status_code == 403
    assert client.get("/api/admin/inspectors", headers=auth(manager_token)).status_code == 403


def test_sysadmin_can_reach_sysadmin_route(client, sysadmin_token):
    assert client.get("/api/admin/settings", headers=auth(sysadmin_token)).status_code == 200


def test_sysadmin_cannot_reach_manager_route(client, sysadmin_token):
    # 系統管理員 must not see the review queue / stats / export.
    assert client.get("/api/admin/stats", headers=auth(sysadmin_token)).status_code == 403
    assert client.get("/api/admin/cases", headers=auth(sysadmin_token)).status_code == 403
