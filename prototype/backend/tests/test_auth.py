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


def test_admin_login_success(client):
    res = client.post("/api/admin/login", json={"username": "admin01", "password": "admin123"})
    assert res.status_code == 200
    assert res.json()["admin"]["username"] == "admin01"


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


# --- role separation (both directions) ------------------------------------
def test_inspector_can_reach_inspector_route(client, inspector_token):
    assert client.get("/api/locations", headers=auth(inspector_token)).status_code == 200


def test_inspector_token_rejected_on_admin_route_403(client, inspector_token):
    res = client.get("/api/admin/stats", headers=auth(inspector_token))
    assert res.status_code == 403


def test_admin_token_rejected_on_inspector_route_403(client, admin_token):
    # An admin token must not be usable as an inspector.
    res = client.get("/api/locations", headers=auth(admin_token))
    assert res.status_code == 403


def test_admin_can_reach_admin_route(client, admin_token):
    assert client.get("/api/admin/stats", headers=auth(admin_token)).status_code == 200
