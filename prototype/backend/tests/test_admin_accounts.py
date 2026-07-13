"""Admin management console: create/list/edit/disable/delete manager & sysadmin
accounts, plus the guard rails that stop the console locking itself out.

Seed baseline (from DEMO_ADMINS): manager01 (manager) and sysadmin01 (the only
sysadmin). Account management is gated to sysadmin.
"""
from __future__ import annotations

from tests.conftest import auth

NEW_MANAGER = {
    "username": "mgr99",
    "password": "manager-pass-99",
    "display_name": "新經理",
    "role": "manager",
}


def _create(client, token, **overrides):
    payload = {**NEW_MANAGER, **overrides}
    return client.post("/api/admin/admins", headers=auth(token), json=payload)


# --- creation -------------------------------------------------------------
def test_create_admin_hides_password_and_can_login(client, sysadmin_token):
    res = _create(client, sysadmin_token)
    assert res.status_code == 200, res.text
    body = res.json()
    assert "password" not in body
    assert body["role"] == "manager"
    assert body["is_active"] is True
    assert body["created_by"] == "sysadmin01"

    # The new manager can actually authenticate and reach a manager route.
    login = client.post("/api/admin/login", json={"username": "mgr99", "password": "manager-pass-99"})
    assert login.status_code == 200
    tok = login.json()["token"]
    assert client.get("/api/admin/stats", headers=auth(tok)).status_code == 200


def test_create_admin_requires_sysadmin(client, manager_token):
    # A manager must not be able to mint privileged accounts.
    res = _create(client, manager_token)
    assert res.status_code == 403


def test_create_admin_rejects_weak_password(client, sysadmin_token):
    res = _create(client, sysadmin_token, password="short")
    assert res.status_code == 400


def test_create_admin_rejects_unknown_role(client, sysadmin_token):
    res = _create(client, sysadmin_token, role="root")
    assert res.status_code == 400


def test_create_duplicate_admin_conflicts(client, sysadmin_token):
    res = _create(client, sysadmin_token, username="sysadmin01")
    assert res.status_code == 409


# --- listing --------------------------------------------------------------
def test_list_admins_hides_passwords(client, sysadmin_token):
    rows = client.get("/api/admin/admins", headers=auth(sysadmin_token)).json()
    usernames = {r["username"] for r in rows}
    assert {"manager01", "sysadmin01"} <= usernames
    assert all("password" not in r for r in rows)
    assert all({"role", "is_active", "created_at"} <= set(r) for r in rows)


# --- update ---------------------------------------------------------------
def test_update_admin_name_and_role(client, sysadmin_token):
    _create(client, sysadmin_token)  # mgr99 as manager
    res = client.patch(
        "/api/admin/admins/mgr99",
        headers=auth(sysadmin_token),
        json={"display_name": "升級管理員", "role": "sysadmin"},
    )
    assert res.status_code == 200
    assert res.json()["display_name"] == "升級管理員"
    assert res.json()["role"] == "sysadmin"


def test_update_admin_password_rotates_credential(client, sysadmin_token):
    _create(client, sysadmin_token)
    upd = client.patch(
        "/api/admin/admins/mgr99",
        headers=auth(sysadmin_token),
        json={"password": "brand-new-secret"},
    )
    assert upd.status_code == 200
    assert client.post("/api/admin/login", json={"username": "mgr99", "password": "manager-pass-99"}).status_code == 401
    assert client.post("/api/admin/login", json={"username": "mgr99", "password": "brand-new-secret"}).status_code == 200


def test_update_admin_password_policy_enforced(client, sysadmin_token):
    _create(client, sysadmin_token)
    res = client.patch("/api/admin/admins/mgr99", headers=auth(sysadmin_token), json={"password": "x"})
    assert res.status_code == 400


# --- disable / active enforcement -----------------------------------------
def test_disable_admin_blocks_new_login_and_live_token(client, sysadmin_token):
    # A manager with a currently-valid token...
    tok = client.post("/api/admin/login", json={"username": "manager01", "password": "manager123"}).json()["token"]
    assert client.get("/api/admin/stats", headers=auth(tok)).status_code == 200

    # ...is disabled by a sysadmin...
    res = client.patch("/api/admin/admins/manager01", headers=auth(sysadmin_token), json={"is_active": False})
    assert res.status_code == 200
    assert res.json()["is_active"] is False

    # ...and both a fresh login and the still-live token are now refused.
    assert client.post("/api/admin/login", json={"username": "manager01", "password": "manager123"}).status_code == 403
    assert client.get("/api/admin/stats", headers=auth(tok)).status_code == 403


def test_reactivate_admin_restores_access(client, sysadmin_token):
    client.patch("/api/admin/admins/manager01", headers=auth(sysadmin_token), json={"is_active": False})
    client.patch("/api/admin/admins/manager01", headers=auth(sysadmin_token), json={"is_active": True})
    assert client.post("/api/admin/login", json={"username": "manager01", "password": "manager123"}).status_code == 200


# --- last-sysadmin invariant ----------------------------------------------
def test_cannot_disable_sole_sysadmin(client, sysadmin_token):
    # sysadmin01 is the only sysadmin in the seed — disabling it would lock out.
    res = client.patch("/api/admin/admins/sysadmin01", headers=auth(sysadmin_token), json={"is_active": False})
    assert res.status_code == 400


def test_cannot_demote_sole_sysadmin(client, sysadmin_token):
    res = client.patch("/api/admin/admins/sysadmin01", headers=auth(sysadmin_token), json={"role": "manager"})
    assert res.status_code == 400


def test_can_demote_when_another_sysadmin_exists(client, sysadmin_token):
    # Add a second sysadmin, then demoting the original is allowed.
    _create(client, sysadmin_token, username="sys2", password="second-sysadmin", role="sysadmin")
    res = client.patch("/api/admin/admins/sysadmin01", headers=auth(sysadmin_token), json={"role": "manager"})
    assert res.status_code == 200
    assert res.json()["role"] == "manager"


# --- delete ---------------------------------------------------------------
def test_delete_admin_removes_account(client, sysadmin_token):
    _create(client, sysadmin_token)
    res = client.delete("/api/admin/admins/mgr99", headers=auth(sysadmin_token))
    assert res.status_code == 200
    rows = client.get("/api/admin/admins", headers=auth(sysadmin_token)).json()
    assert not any(r["username"] == "mgr99" for r in rows)


def test_cannot_delete_self(client, sysadmin_token):
    res = client.delete("/api/admin/admins/sysadmin01", headers=auth(sysadmin_token))
    assert res.status_code == 400


def test_delete_missing_admin_404(client, sysadmin_token):
    res = client.delete("/api/admin/admins/ghost", headers=auth(sysadmin_token))
    assert res.status_code == 404
