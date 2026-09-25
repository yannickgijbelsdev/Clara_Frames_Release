"""Iteration 7: entrance (one-shot) animations on elements."""
import os
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    ticket = r.json()["mfa_ticket"]
    code = pyotp.TOTP(ADMIN_TOTP_SECRET).now()
    r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    return s


@pytest.fixture(scope="module")
def workspace_id(admin_session):
    r = admin_session.get(f"{API}/workspaces", timeout=10)
    assert r.status_code == 200
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def scene(admin_session, workspace_id):
    elements = [
        {"id": "e_ent", "type": "text", "x": 100, "y": 100, "w": 300, "h": 60,
         "props": {"name": "Enter", "text": "HI",
                   "entrance": "slide-up", "entranceDuration": 0.8, "entranceDelay": 0.2,
                   "animation": "pulse", "animationDuration": 1.5},
         "style": {"fontSize": 32, "color": "#00ffaa"}}
    ]
    payload = {"name": "TEST_Entrance_Scene", "workspace_id": workspace_id, "elements": elements}
    r = admin_session.post(f"{API}/scenes", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    sc = r.json()
    yield sc
    admin_session.delete(f"{API}/scenes/{sc['id']}", timeout=10)


class TestPersistence:
    def test_get_returns_entrance_fields(self, admin_session, scene):
        r = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10)
        assert r.status_code == 200
        sc = r.json()
        el = next(e for e in sc["elements"] if e["id"] == "e_ent")
        assert el["props"]["entrance"] == "slide-up"
        assert abs(float(el["props"]["entranceDuration"]) - 0.8) < 1e-6
        assert abs(float(el["props"]["entranceDelay"]) - 0.2) < 1e-6
        # continuous animation still there and independent
        assert el["props"]["animation"] == "pulse"
        assert float(el["props"]["animationDuration"]) == 1.5

    def test_put_updates_entrance(self, admin_session, scene):
        cur = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10).json()
        for preset in ["fade", "slide-down", "slide-left", "slide-right", "zoom", "none"]:
            for el in cur["elements"]:
                el["props"]["entrance"] = preset
                el["props"]["entranceDuration"] = 1.0
                el["props"]["entranceDelay"] = 0.1
            body = {"name": cur["name"], "workspace_id": cur.get("workspace_id"),
                    "elements": cur["elements"], "background": cur.get("background", {})}
            r = admin_session.put(f"{API}/scenes/{scene['id']}", json=body, timeout=10)
            assert r.status_code == 200
            r2 = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10).json()
            got = r2["elements"][0]["props"]["entrance"]
            assert got == preset, f"expected {preset} got {got}"
        # restore to slide-up so overlay test finds clara-in-up
        for el in cur["elements"]:
            el["props"]["entrance"] = "slide-up"
        admin_session.put(f"{API}/scenes/{scene['id']}",
                          json={"name": cur["name"], "workspace_id": cur.get("workspace_id"),
                                "elements": cur["elements"]}, timeout=10)


class TestOverlayHTML:
    def test_overlay_contains_entrance_keyframes_and_helpers(self, scene):
        token = scene["public_token"]
        r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=10)
        assert r.status_code == 200
        html = r.text
        for kw in ["clara-in-fade", "clara-in-up", "clara-in-down",
                   "clara-in-left", "clara-in-right", "clara-in-zoom"]:
            assert f"@keyframes {kw}" in html, f"missing @keyframes {kw}"
        assert "entranceAnim" in html
        assert "retriggerEntrance" in html
        # scene has slide-up so mapped name clara-in-up should be referenced
        assert "clara-in-up" in html
        # continuous pulse still applied on inner wrapper
        assert "clara-pulse" in html
        # entrance uses 'both' fill mode so it stays at final state
        assert "both" in html
