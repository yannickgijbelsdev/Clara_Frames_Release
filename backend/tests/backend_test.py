"""Backend tests for vMix Overlay Studio."""
import os
import time
import uuid
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://overlay-settings-hub.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _totp():
    return pyotp.TOTP(ADMIN_TOTP_SECRET).now()


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("mfa_required") is True
    ticket = data["mfa_ticket"]
    r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": _totp()}, timeout=15)
    assert r2.status_code == 200, r2.text
    return s


# ------------- Auth -------------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=10)
        assert r.status_code == 401

    def test_login_mfa_required(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d.get("mfa_required") is True
        assert d.get("mfa_ticket")

    def test_mfa_verify_wrong_code(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=10)
        ticket = r.json()["mfa_ticket"]
        r2 = requests.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": "000000"}, timeout=10)
        assert r2.status_code == 401

    def test_full_admin_login(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        me = r.json()
        assert me["email"] == ADMIN_EMAIL
        assert me["role"] == "admin"
        # cookie assertion
        assert "access_token" in admin_session.cookies.get_dict()

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401

    def test_register_and_setup_verify(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Test"}, timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "secret" in data and "qr" in data and data["qr"].startswith("data:image/png")
        secret = data["secret"]
        # login before setup -> should get mfa_setup_required
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass1234!"}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("mfa_setup_required") is True
        # setup verify
        code = pyotp.TOTP(secret).now()
        s = requests.Session()
        r3 = s.post(f"{API}/auth/mfa/setup-verify", json={"email": email, "password": "Pass1234!", "code": code}, timeout=10)
        assert r3.status_code == 200, r3.text
        # after enabling mfa, login should now return mfa_required
        r4 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Pass1234!"}, timeout=10)
        assert r4.json().get("mfa_required") is True

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"email": ADMIN_EMAIL, "password": "x", "name": "n"}, timeout=10)
        assert r.status_code == 400


# ------------- Sources -------------
class TestSources:
    created_ids = []

    def test_create_builtin_weather(self, admin_session):
        r = admin_session.post(f"{API}/sources", json={"name": "TEST_Weather", "type": "builtin_weather"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "builtin_weather"
        assert d["latitude"] == 50.85 and d["longitude"] == 4.35
        assert len(d["fields"]) == 3
        assert "open-meteo" in d["url"]
        TestSources.created_ids.append(d["id"])

    def test_create_builtin_time(self, admin_session):
        r = admin_session.post(f"{API}/sources", json={"name": "TEST_Time", "type": "builtin_time", "timezone": "Europe/Brussels"}, timeout=10)
        assert r.status_code == 200
        TestSources.created_ids.append(r.json()["id"])

    def test_create_custom(self, admin_session):
        payload = {
            "name": "TEST_Custom", "type": "custom",
            "url": "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m",
            "fields": [{"key": "temp", "label": "T", "path": "current.temperature_2m"}]
        }
        r = admin_session.post(f"{API}/sources", json=payload, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["fields"][0]["key"] == "temp"
        TestSources.created_ids.append(d["id"])

    def test_list_sources(self, admin_session):
        r = admin_session.get(f"{API}/sources", timeout=10)
        assert r.status_code == 200
        assert len(r.json()) >= len(TestSources.created_ids)

    def test_test_source_weather(self, admin_session):
        sid = TestSources.created_ids[0]
        r = admin_session.post(f"{API}/sources/{sid}/test", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        vals = d["values"]
        assert "temperature" in vals
        # if API succeeded, temperature should be numeric
        if d.get("error") is None:
            assert isinstance(vals["temperature"], (int, float))

    def test_test_source_custom(self, admin_session):
        sid = TestSources.created_ids[2]
        r = admin_session.post(f"{API}/sources/{sid}/test", timeout=15)
        assert r.status_code == 200
        assert "temp" in r.json()["values"]

    def test_update_source(self, admin_session):
        sid = TestSources.created_ids[1]
        r = admin_session.put(f"{API}/sources/{sid}", json={"name": "TEST_Time_Renamed", "type": "builtin_time", "timezone": "UTC"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Time_Renamed"
        assert r.json()["timezone"] == "UTC"

    def test_delete_source(self, admin_session):
        # delete the custom one
        sid = TestSources.created_ids[2]
        r = admin_session.delete(f"{API}/sources/{sid}", timeout=10)
        assert r.status_code == 200


# ------------- Scenes + Public -------------
class TestScenes:
    scene_id = None
    public_token = None

    def test_create_scene(self, admin_session):
        weather_id = TestSources.created_ids[0] if TestSources.created_ids else None
        elements = [
            {"id": "e1", "type": "text", "x": 100, "y": 100, "w": 400, "h": 80,
             "props": {"name": "Title", "text": "Hello vMix"}, "style": {}},
            {"id": "e2", "type": "clock", "x": 100, "y": 200, "w": 300, "h": 60,
             "props": {"name": "Clock1", "timezone": "UTC", "format": "HH:mm:ss"}, "style": {}},
            {"id": "e3", "type": "image", "x": 100, "y": 300, "w": 200, "h": 200,
             "props": {"src": "https://picsum.photos/200"}, "style": {}},
            {"id": "e4", "type": "timed_text", "x": 100, "y": 500, "w": 500, "h": 100,
             "props": {"name": "Promo", "text": "Live now", "start": "00:00", "end": "23:59", "timezone": "UTC"}, "style": {}},
        ]
        if weather_id:
            elements.append({"id": "e5", "type": "api_field", "x": 100, "y": 620, "w": 300, "h": 80,
                             "props": {"name": "Temp", "sourceId": weather_id, "fieldKey": "temperature", "prefix": "T:", "suffix": "°C"}, "style": {}})
        r = admin_session.post(f"{API}/scenes", json={"name": "TEST_Scene", "elements": elements}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["public_token"] and len(d["public_token"]) == 32
        TestScenes.scene_id = d["id"]
        TestScenes.public_token = d["public_token"]

    def test_get_scene(self, admin_session):
        r = admin_session.get(f"{API}/scenes/{TestScenes.scene_id}", timeout=10)
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Scene"
        assert len(r.json()["elements"]) >= 4

    def test_list_scenes(self, admin_session):
        r = admin_session.get(f"{API}/scenes", timeout=10)
        assert r.status_code == 200
        assert any(s["id"] == TestScenes.scene_id for s in r.json())

    def test_update_scene(self, admin_session):
        r = admin_session.get(f"{API}/scenes/{TestScenes.scene_id}", timeout=10)
        scene = r.json()
        scene["name"] = "TEST_Scene_Updated"
        r2 = admin_session.put(f"{API}/scenes/{TestScenes.scene_id}", json={
            "name": scene["name"], "width": scene["width"], "height": scene["height"],
            "background": scene["background"], "elements": scene["elements"]
        }, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Scene_Updated"

    def test_public_data_json_no_auth(self):
        r = requests.get(f"{API}/public/scene/{TestScenes.public_token}/data.json", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, list) and len(d) == 1
        row = d[0]
        assert "Title" in row and row["Title"] == "Hello vMix"
        assert "Clock1" in row

    def test_public_data_xml(self):
        r = requests.get(f"{API}/public/scene/{TestScenes.public_token}/data.xml", timeout=15)
        assert r.status_code == 200
        assert r.text.startswith('<?xml')
        assert '<Title>Hello vMix</Title>' in r.text

    def test_public_overlay_html(self):
        r = requests.get(f"{API}/public/scene/{TestScenes.public_token}/overlay", timeout=10)
        assert r.status_code == 200
        assert "<html" in r.text.lower() or "<!doctype" in r.text.lower()
        assert TestScenes.public_token in r.text

    def test_public_values_json(self):
        r = requests.get(f"{API}/public/scene/{TestScenes.public_token}/values.json", timeout=15)
        assert r.status_code == 200

    def test_public_settings_download(self):
        r = requests.get(f"{API}/public/scene/{TestScenes.public_token}/settings", timeout=10)
        assert r.status_code == 200
        assert "attachment" in r.headers.get("content-disposition", "")
        body = r.json()
        assert body["id"] == TestScenes.scene_id
        assert "vmix" in body and "overlay_url" in body["vmix"]

    def test_regenerate_token(self, admin_session):
        old = TestScenes.public_token
        r = admin_session.post(f"{API}/scenes/{TestScenes.scene_id}/regenerate-token", timeout=10)
        assert r.status_code == 200
        new = r.json()["public_token"]
        assert new != old
        # old should now fail
        r2 = requests.get(f"{API}/public/scene/{old}/data.json", timeout=10)
        assert r2.status_code == 404
        # new should work
        r3 = requests.get(f"{API}/public/scene/{new}/data.json", timeout=10)
        assert r3.status_code == 200
        TestScenes.public_token = new

    def test_public_invalid_token(self):
        r = requests.get(f"{API}/public/scene/invalidtoken123/data.json", timeout=10)
        assert r.status_code == 404

    def test_scene_requires_auth(self):
        r = requests.get(f"{API}/scenes", timeout=10)
        assert r.status_code == 401

    def test_delete_scene(self, admin_session):
        r = admin_session.delete(f"{API}/scenes/{TestScenes.scene_id}", timeout=10)
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/scenes/{TestScenes.scene_id}", timeout=10)
        assert r2.status_code == 404


@pytest.fixture(scope="session", autouse=True)
def _cleanup(admin_session):
    yield
    # delete created sources
    for sid in TestSources.created_ids:
        try:
            admin_session.delete(f"{API}/sources/{sid}", timeout=5)
        except Exception:
            pass
