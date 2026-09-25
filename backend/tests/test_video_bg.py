"""Iteration 4 tests: video uploads + video scene backgrounds + overlay rendering."""
import os
import re
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
    assert r2.status_code == 200
    return s


@pytest.fixture(scope="module")
def workspace_id(admin_session):
    r = admin_session.get(f"{API}/workspaces", timeout=15)
    assert r.status_code == 200
    return r.json()[0]["id"]


# --- Video upload ---
class TestVideoUpload:
    def test_mp4_upload_success(self, admin_session):
        payload = b"\x00\x00\x00\x18ftypmp42" + os.urandom(4096)  # tiny mp4-ish blob
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("clip.mp4", payload, "video/mp4")}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["key"].endswith(".mp4")
        assert d["url"].endswith(".mp4")
        assert "nbg1.your-objectstorage.com" in d["url"]
        assert "koodh-clara" in d["url"]
        pub = requests.get(d["url"], timeout=30)
        assert pub.status_code == 200
        assert pub.headers.get("content-type", "").startswith("video/")
        pytest.video_url = d["url"]

    def test_webm_upload_success(self, admin_session):
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("c.webm", os.urandom(2048), "video/webm")}, timeout=60)
        assert r.status_code == 200
        assert r.json()["key"].endswith(".webm")

    def test_text_still_rejected(self, admin_session):
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("t.txt", b"hello", "text/plain")}, timeout=20)
        assert r.status_code == 400

    def test_video_too_large_rejected(self, admin_session):
        # 51 MB > 50 MB video limit
        big = os.urandom(51 * 1024 * 1024 + 10)
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("big.mp4", big, "video/mp4")}, timeout=120)
        assert r.status_code == 400
        assert "large" in r.json().get("detail", "").lower() or "50" in r.json().get("detail", "")


# --- Scene background persistence ---
class TestSceneVideoBackground:
    def test_create_scene_with_video_bg_and_get(self, admin_session, workspace_id):
        video_src = getattr(pytest, "video_url", None) or \
            "https://nbg1.your-objectstorage.com/koodh-clara/uploads/fake/x.mp4"
        payload = {
            "name": "TEST_video_bg_scene",
            "background": {"color": "#0b1020", "type": "video", "src": video_src},
            "elements": [],
            "workspace_id": workspace_id,
        }
        r = admin_session.post(f"{API}/scenes", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        scene = r.json()
        sid = scene["id"]
        assert scene["background"]["type"] == "video"
        assert scene["background"]["src"] == video_src

        # GET verifies persistence
        r2 = admin_session.get(f"{API}/scenes/{sid}", timeout=15)
        assert r2.status_code == 200
        got = r2.json()
        assert got["background"]["type"] == "video"
        assert got["background"]["src"] == video_src
        assert got["background"]["color"] == "#0b1020"
        pytest.scene_id = sid
        pytest.scene_token = got["public_token"]
        pytest.video_src = video_src

    def test_update_scene_bg_to_image(self, admin_session, workspace_id):
        sid = pytest.scene_id
        new_src = "https://nbg1.your-objectstorage.com/koodh-clara/uploads/fake/x.png"
        r = admin_session.put(f"{API}/scenes/{sid}", json={
            "name": "TEST_video_bg_scene", "width": 1920, "height": 1080,
            "background": {"color": "#111", "type": "image", "src": new_src},
            "elements": [], "workspace_id": workspace_id,
        }, timeout=15)
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/scenes/{sid}", timeout=15)
        assert r2.json()["background"]["type"] == "image"
        assert r2.json()["background"]["src"] == new_src

    def test_overlay_html_contains_video_bg_logic(self, admin_session, workspace_id):
        # Reset back to video so overlay contains video element
        sid = pytest.scene_id
        vsrc = pytest.video_src
        admin_session.put(f"{API}/scenes/{sid}", json={
            "name": "TEST_video_bg_scene", "width": 1920, "height": 1080,
            "background": {"color": "#0b1020", "type": "video", "src": vsrc},
            "elements": [], "workspace_id": workspace_id,
        }, timeout=15)
        token = pytest.scene_token
        r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=15)
        assert r.status_code == 200
        html = r.text
        # Logic exists to render video background
        assert "SCENE.background" in html
        assert "createElement('video')" in html
        assert "autoplay" in html.lower()
        assert "loop" in html.lower()
        assert "muted" in html.lower()
        # scene data with our video src embedded
        assert vsrc in html
        assert '"type": "video"' in html or "'type': 'video'" in html or '"type":"video"' in html

    def test_clear_bg_reverts_to_color(self, admin_session, workspace_id):
        sid = pytest.scene_id
        r = admin_session.put(f"{API}/scenes/{sid}", json={
            "name": "TEST_video_bg_scene", "width": 1920, "height": 1080,
            "background": {"color": "#0b1020"}, "elements": [], "workspace_id": workspace_id,
        }, timeout=15)
        assert r.status_code == 200
        got = admin_session.get(f"{API}/scenes/{sid}", timeout=15).json()
        assert got["background"].get("type") in (None, "color")
        assert got["background"]["color"] == "#0b1020"

    def test_cleanup(self, admin_session):
        admin_session.delete(f"{API}/scenes/{pytest.scene_id}", timeout=15)
