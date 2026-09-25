"""Iteration 5: scene background fit + overlay and per-element animations."""
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
    """Create a scene with repeat background + overlay + pulse-animated element."""
    elements = [
        {"id": "e_pulse", "type": "text", "x": 100, "y": 100, "w": 300, "h": 60,
         "props": {"name": "Pulser", "text": "PING",
                   "animation": "pulse", "animationDuration": 1.5},
         "style": {"fontSize": 32, "color": "#ff00aa"}}
    ]
    payload = {
        "name": "TEST_AnimBG_Scene",
        "workspace_id": workspace_id,
        "elements": elements,
        "background": {
            "color": "#000000",
            "type": "image",
            "src": "https://example.com/tile.png",
            "fit": "repeat",
            "overlayColor": "#123456",
            "overlayOpacity": 0.42,
        },
    }
    r = admin_session.post(f"{API}/scenes", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    sc = r.json()
    yield sc
    admin_session.delete(f"{API}/scenes/{sc['id']}", timeout=10)


class TestScenePersistence:
    def test_get_returns_bg_fields(self, admin_session, scene):
        r = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10)
        assert r.status_code == 200
        sc = r.json()
        bg = sc["background"]
        assert bg["fit"] == "repeat"
        assert bg["src"] == "https://example.com/tile.png"
        assert bg["overlayColor"] == "#123456"
        assert abs(float(bg["overlayOpacity"]) - 0.42) < 1e-6
        assert bg["type"] == "image"

    def test_get_returns_element_animation(self, admin_session, scene):
        r = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10)
        sc = r.json()
        el = next(e for e in sc["elements"] if e["id"] == "e_pulse")
        assert el["props"]["animation"] == "pulse"
        assert float(el["props"]["animationDuration"]) == 1.5

    def test_update_persists_other_fit_values(self, admin_session, scene):
        current = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10).json()
        for fit in ["cover", "contain", "repeat"]:
            body = {
                "name": current["name"],
                "workspace_id": current.get("workspace_id"),
                "elements": current["elements"],
                "background": {**current["background"], "fit": fit, "overlayOpacity": 0.7},
            }
            r = admin_session.put(f"{API}/scenes/{scene['id']}", json=body, timeout=10)
            assert r.status_code == 200
            r2 = admin_session.get(f"{API}/scenes/{scene['id']}", timeout=10)
            assert r2.json()["background"]["fit"] == fit
            assert abs(float(r2.json()["background"]["overlayOpacity"]) - 0.7) < 1e-6


class TestOverlayHTML:
    def test_overlay_html_contains_keyframes_and_helpers(self, scene):
        token = scene["public_token"]
        r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=10)
        assert r.status_code == 200
        html = r.text
        for kw in ["clara-pulse", "clara-fade", "clara-spin", "clara-bounce",
                   "clara-float", "clara-blink", "clara-slide"]:
            assert f"@keyframes {kw}" in html, f"missing @keyframes {kw}"
        assert "applyAnim" in html
        assert "backgroundRepeat" in html
        # honors fit contain/cover via objectFit references
        assert "objectFit" in html or "object-fit" in html or "backgroundSize" in html
        # overlay dim uses the color we set
        assert "#123456" in html or "#123456".lower() in html.lower()


class TestElementTextRegression:
    def test_element_txt_returns_value(self, admin_session, workspace_id):
        elements = [{"id": "t1", "type": "text", "x": 0, "y": 0, "w": 100, "h": 40,
                     "props": {"name": "T", "text": "HelloAnim"}, "style": {}}]
        r = admin_session.post(f"{API}/scenes",
                               json={"name": "TEST_AnimBG_Regress", "workspace_id": workspace_id,
                                     "elements": elements}, timeout=10)
        assert r.status_code == 200
        sc = r.json()
        try:
            rr = requests.get(f"{API}/public/scene/{sc['public_token']}/element/t1.txt", timeout=10)
            assert rr.status_code == 200
            assert rr.text == "HelloAnim"
        finally:
            admin_session.delete(f"{API}/scenes/{sc['id']}", timeout=10)
