"""Backend tests for the second iteration new features:
Workspaces, per-element outputs, account settings, user management, backup-code login.
"""
import os
import uuid
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://overlay-settings-hub.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _totp(secret=ADMIN_TOTP_SECRET):
    return pyotp.TOTP(secret).now()


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    ticket = r.json()["mfa_ticket"]
    r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": _totp()}, timeout=15)
    assert r2.status_code == 200, r2.text
    return s


@pytest.fixture(scope="module")
def fresh_user():
    """Register + setup a fresh user, MFA-enabled, returns (session, email, password, secret)."""
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "Pass1234!"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "name": "T"}, timeout=15)
    assert r.status_code == 200, r.text
    secret = r.json()["secret"]
    s = requests.Session()
    code = pyotp.TOTP(secret).now()
    r2 = s.post(f"{API}/auth/mfa/setup-verify", json={"email": email, "password": password, "code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    return {"session": s, "email": email, "password": password, "secret": secret}


# ---------------- Workspaces ----------------
class TestWorkspaces:
    def test_list_auto_creates_default(self, admin_session):
        r = admin_session.get(f"{API}/workspaces", timeout=10)
        assert r.status_code == 200
        wss = r.json()
        assert isinstance(wss, list) and len(wss) >= 1
        assert any(w["name"] for w in wss)
        for w in wss:
            assert "id" in w and "name" in w

    def test_create_and_update_and_delete(self, admin_session):
        r = admin_session.post(f"{API}/workspaces", json={"name": "TEST_WS_A", "color": "#123456"}, timeout=10)
        assert r.status_code == 200
        w1 = r.json()
        assert w1["name"] == "TEST_WS_A"
        ws_id = w1["id"]
        # update
        r2 = admin_session.put(f"{API}/workspaces/{ws_id}", json={"name": "TEST_WS_A2", "color": "#ff0000"}, timeout=10)
        assert r2.status_code == 200
        # verify persisted via list
        r3 = admin_session.get(f"{API}/workspaces", timeout=10)
        assert any(w["id"] == ws_id and w["name"] == "TEST_WS_A2" for w in r3.json())
        # delete (not last - safe because default + this one exist)
        r4 = admin_session.delete(f"{API}/workspaces/{ws_id}", timeout=10)
        assert r4.status_code == 200

    def test_cannot_delete_last_workspace(self, fresh_user):
        s = fresh_user["session"]
        r = s.get(f"{API}/workspaces", timeout=10)
        assert r.status_code == 200
        ws = r.json()
        assert len(ws) == 1
        # try to delete the only workspace
        r2 = s.delete(f"{API}/workspaces/{ws[0]['id']}", timeout=10)
        assert r2.status_code == 400

    def test_scenes_sources_scoped_by_workspace(self, admin_session):
        # get default workspace
        wss = admin_session.get(f"{API}/workspaces", timeout=10).json()
        ws1 = wss[0]["id"]
        # create second workspace
        ws2 = admin_session.post(f"{API}/workspaces", json={"name": "TEST_WS_SCOPE"}, timeout=10).json()["id"]
        # create a scene under ws2
        r = admin_session.post(f"{API}/scenes", json={"name": "TEST_ScopedScene", "workspace_id": ws2, "elements": []}, timeout=10)
        assert r.status_code == 200
        scene_id = r.json()["id"]
        # list scoped ws1 - should NOT include our scene
        r1 = admin_session.get(f"{API}/scenes?workspace_id={ws1}", timeout=10)
        assert not any(s["id"] == scene_id for s in r1.json())
        # list scoped ws2 - SHOULD include
        r2 = admin_session.get(f"{API}/scenes?workspace_id={ws2}", timeout=10)
        assert any(s["id"] == scene_id for s in r2.json())
        # sources scope: create source in ws2
        rs = admin_session.post(f"{API}/sources", json={"name": "TEST_ScopedSrc", "type": "builtin_time", "timezone": "UTC", "workspace_id": ws2}, timeout=10)
        assert rs.status_code == 200
        src_id = rs.json()["id"]
        r_s1 = admin_session.get(f"{API}/sources?workspace_id={ws1}", timeout=10)
        assert not any(s["id"] == src_id for s in r_s1.json())
        r_s2 = admin_session.get(f"{API}/sources?workspace_id={ws2}", timeout=10)
        assert any(s["id"] == src_id for s in r_s2.json())
        # DELETE workspace cascades: delete ws2 and check scene/source gone
        rd = admin_session.delete(f"{API}/workspaces/{ws2}", timeout=10)
        assert rd.status_code == 200
        # scene should now 404
        r_get = admin_session.get(f"{API}/scenes/{scene_id}", timeout=10)
        assert r_get.status_code == 404


# ---------------- Per-element outputs ----------------
class TestElementOutputs:
    scene_id = None
    token = None

    def test_setup_scene_with_elements(self, admin_session):
        elements = [
            {"id": "t1", "type": "text", "x": 0, "y": 0, "w": 100, "h": 40,
             "props": {"name": "Title", "text": "Hello"}, "style": {}},
            {"id": "c1", "type": "clock", "x": 0, "y": 50, "w": 100, "h": 40,
             "props": {"name": "Clock", "timezone": "UTC", "format": "HH:mm:ss"}, "style": {}},
        ]
        r = admin_session.post(f"{API}/scenes", json={"name": "TEST_EO_Scene", "elements": elements}, timeout=10)
        assert r.status_code == 200
        TestElementOutputs.scene_id = r.json()["id"]
        TestElementOutputs.token = r.json()["public_token"]

    def test_element_txt_text(self):
        r = requests.get(f"{API}/public/scene/{TestElementOutputs.token}/element/t1.txt", timeout=10)
        assert r.status_code == 200
        assert r.text == "Hello"
        assert "text/plain" in r.headers.get("content-type", "")

    def test_element_txt_clock_format(self):
        r = requests.get(f"{API}/public/scene/{TestElementOutputs.token}/element/c1.txt", timeout=10)
        assert r.status_code == 200
        # HH:mm:ss format => length 8 with colons
        import re
        assert re.match(r"^\d{2}:\d{2}:\d{2}$", r.text), f"Unexpected clock text: {r.text!r}"

    def test_element_json(self):
        r = requests.get(f"{API}/public/scene/{TestElementOutputs.token}/element/t1.json", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "t1"
        assert d["type"] == "text"
        assert d["name"] == "Title"
        assert d["value"] == "Hello"

    def test_element_not_found(self):
        r = requests.get(f"{API}/public/scene/{TestElementOutputs.token}/element/nope.txt", timeout=10)
        assert r.status_code == 404

    def test_cleanup(self, admin_session):
        admin_session.delete(f"{API}/scenes/{TestElementOutputs.scene_id}", timeout=10)


# ---------------- Account settings (on fresh user, not admin) ----------------
class TestAccountSettings:
    def test_change_password_wrong_current(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/auth/change-password", json={"current_password": "wrong", "new_password": "NewPass1!"}, timeout=10)
        assert r.status_code == 401

    def test_change_password_too_short(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/auth/change-password", json={"current_password": fresh_user["password"], "new_password": "abc"}, timeout=10)
        assert r.status_code == 400

    def test_change_password_ok_and_login_with_new(self, fresh_user):
        s = fresh_user["session"]
        new_pw = "NewPass1234!"
        r = s.post(f"{API}/auth/change-password", json={"current_password": fresh_user["password"], "new_password": new_pw}, timeout=10)
        assert r.status_code == 200
        # verify by hitting login with new pw (should get mfa_required)
        r2 = requests.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": new_pw}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("mfa_required") is True
        fresh_user["password"] = new_pw

    def test_update_profile(self, fresh_user):
        s = fresh_user["session"]
        r = s.put(f"{API}/auth/profile", json={"name": "Renamed User", "avatar": "https://example.com/a.png"}, timeout=10)
        assert r.status_code == 200
        # verify via /auth/me
        r2 = s.get(f"{API}/auth/me", timeout=10)
        assert r2.status_code == 200
        me = r2.json()
        assert me["name"] == "Renamed User"
        assert me.get("avatar") == "https://example.com/a.png"

    def test_2fa_reset_then_confirm_returns_backup_codes(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/auth/2fa/reset", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "secret" in d and "qr" in d and d["qr"].startswith("data:image/png")
        new_secret = d["secret"]
        # confirm with wrong code
        rw = s.post(f"{API}/auth/2fa/confirm", json={"code": "000000"}, timeout=10)
        assert rw.status_code == 401
        # confirm with correct
        code = pyotp.TOTP(new_secret).now()
        rc = s.post(f"{API}/auth/2fa/confirm", json={"code": code}, timeout=10)
        assert rc.status_code == 200
        body = rc.json()
        assert body["ok"] is True
        assert isinstance(body["backup_codes"], list) and len(body["backup_codes"]) == 8
        fresh_user["secret"] = new_secret
        fresh_user["backup_codes"] = body["backup_codes"]

    def test_regen_backup_codes(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/auth/2fa/backup-codes", timeout=10)
        assert r.status_code == 200
        codes = r.json()["backup_codes"]
        assert len(codes) == 8
        # each different from previous set
        assert set(codes) != set(fresh_user.get("backup_codes", []))
        fresh_user["backup_codes"] = codes


# ---------------- Login with backup code ----------------
class TestBackupLogin:
    def test_login_with_backup_code_consumes_it(self, fresh_user):
        codes = fresh_user.get("backup_codes")
        assert codes, "requires prior test to generate backup codes"
        code = codes[0]
        # login step 1
        r1 = requests.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]}, timeout=10)
        assert r1.status_code == 200
        ticket = r1.json()["mfa_ticket"]
        # verify with backup code
        s = requests.Session()
        r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code}, timeout=10)
        assert r2.status_code == 200, r2.text
        assert "access_token" in s.cookies.get_dict()
        # try to use same backup code again -> should fail
        r3 = requests.post(f"{API}/auth/login", json={"email": fresh_user["email"], "password": fresh_user["password"]}, timeout=10)
        ticket2 = r3.json()["mfa_ticket"]
        r4 = requests.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket2, "code": code}, timeout=10)
        assert r4.status_code == 401


# ---------------- User management (admin) ----------------
class TestUserManagement:
    created_user_id = None

    def test_non_admin_forbidden(self, fresh_user):
        s = fresh_user["session"]
        r = s.get(f"{API}/users", timeout=10)
        assert r.status_code == 403

    def test_list_users(self, admin_session):
        r = admin_session.get(f"{API}/users", timeout=10)
        assert r.status_code == 200
        users = r.json()
        assert any(u["email"] == ADMIN_EMAIL for u in users)

    def test_create_user(self, admin_session):
        email = f"test_admin_created_{uuid.uuid4().hex[:6]}@example.com"
        r = admin_session.post(f"{API}/users", json={"email": email, "password": "Pass1234!", "name": "Test Created", "role": "user"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == email
        assert d["role"] == "user"
        TestUserManagement.created_user_id = d["id"]
        TestUserManagement.created_email = email

    def test_update_user_role(self, admin_session):
        uid = TestUserManagement.created_user_id
        r = admin_session.put(f"{API}/users/{uid}", json={"role": "admin"}, timeout=10)
        assert r.status_code == 200
        # verify via list
        users = admin_session.get(f"{API}/users", timeout=10).json()
        u = next(u for u in users if u["id"] == uid)
        assert u["role"] == "admin"

    def test_admin_cannot_delete_self(self, admin_session):
        me = admin_session.get(f"{API}/auth/me", timeout=10).json()
        r = admin_session.delete(f"{API}/users/{me['id']}", timeout=10)
        assert r.status_code == 400

    def test_delete_user(self, admin_session):
        uid = TestUserManagement.created_user_id
        r = admin_session.delete(f"{API}/users/{uid}", timeout=10)
        assert r.status_code == 200
        users = admin_session.get(f"{API}/users", timeout=10).json()
        assert not any(u["id"] == uid for u in users)

    def test_create_duplicate_user(self, admin_session):
        r = admin_session.post(f"{API}/users", json={"email": ADMIN_EMAIL, "password": "x", "name": "n", "role": "user"}, timeout=10)
        assert r.status_code == 400
