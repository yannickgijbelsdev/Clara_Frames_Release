"""
Tests for the Ticker-bar pipeline (iteration 17):
- POST /api/submissions/{sid}/ticker toggles ticker flag
- GET /api/forms/{fid}/ticker-items returns items for messages marked ticker=True
- GET /api/public/scene/{token}/ticker/{form_id} returns same items (unauth)
- Overlay HTML includes clara-ticker animation + ticker element rendering
- Regression: /api/sources/values still resolves, overlay export still 200
"""
import os
import uuid
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://overlay-settings-hub.preview.emergentagent.com").rstrip("/")
EMAIL = "yannick.gijbels@koodh.com"
PASSWORD = "KYLovie13monx"
TOTP_SECRET = "NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY"
TARGET_WS = "83e9d223-ae96-4e12-a0ff-198a959582c5"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"mfa_ticket": data["mfa_ticket"], "code": code}, timeout=20)
        assert r2.status_code == 200, r2.text
    elif data.get("mfa_setup_required"):
        pytest.skip("MFA not yet set up")
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert me.status_code == 200
    return s


@pytest.fixture(scope="module")
def form(client):
    payload = {
        "workspace_id": TARGET_WS,
        "name": "TEST_TickerForm",
        "description": "",
        "fields": [
            {"key": "msg", "label": "Message", "type": "text", "required": True},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload, timeout=10)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    assert f.get("public_token")
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}", timeout=10)


@pytest.fixture(scope="module")
def submission(client, form):
    # Public submit (no auth) using the form's public_token
    r = requests.post(
        f"{BASE_URL}/api/public/form/{form['public_token']}/submit",
        json={"data": {"msg": "Hello Ticker World"}},
        timeout=10,
    )
    assert r.status_code == 200, r.text
    sid = r.json().get("id")
    assert sid
    yield sid
    client.delete(f"{BASE_URL}/api/submissions/{sid}", timeout=10)


class TestTickerToggle:
    def test_ticker_items_empty_before_toggle(self, client, form):
        r = client.get(f"{BASE_URL}/api/forms/{form['id']}/ticker-items", timeout=10)
        assert r.status_code == 200
        assert r.json().get("items") == []

    def test_toggle_on(self, client, submission):
        r = client.post(f"{BASE_URL}/api/submissions/{submission}/ticker", json={"on": True}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert data.get("ticker") is True

    def test_ticker_items_contains_submission_text(self, client, form, submission):
        r = client.get(f"{BASE_URL}/api/forms/{form['id']}/ticker-items", timeout=10)
        assert r.status_code == 200
        items = r.json().get("items") or []
        assert "Hello Ticker World" in items

    def test_toggle_off(self, client, submission, form):
        r = client.post(f"{BASE_URL}/api/submissions/{submission}/ticker", json={"on": False}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("ticker") is False
        r2 = client.get(f"{BASE_URL}/api/forms/{form['id']}/ticker-items", timeout=10)
        assert "Hello Ticker World" not in (r2.json().get("items") or [])

    def test_toggle_back_on_for_public(self, client, submission):
        r = client.post(f"{BASE_URL}/api/submissions/{submission}/ticker", json={"on": True}, timeout=10)
        assert r.status_code == 200


class TestTickerPublic:
    @pytest.fixture(scope="class")
    def scene(self, client, form):
        payload = {
            "name": "TEST_TickerScene",
            "workspace_id": TARGET_WS,
            "elements": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "ticker",
                    "props": {
                        "name": "ticker1", "formId": form["id"], "freeText": "Welkom",
                        "icon": "\u25CF", "speed": 0.35,
                        "x": 0, "y": 1020, "w": 1920, "h": 60,
                    },
                }
            ],
            "canvas": {"w": 1920, "h": 1080},
        }
        r = client.post(f"{BASE_URL}/api/scenes", json=payload, timeout=10)
        assert r.status_code in (200, 201), r.text
        sc = r.json()
        yield sc
        client.delete(f"{BASE_URL}/api/scenes/{sc['id']}", timeout=10)

    def test_public_ticker_items(self, scene, form):
        token = scene["public_token"]
        r = requests.get(f"{BASE_URL}/api/public/scene/{token}/ticker/{form['id']}", timeout=10)
        assert r.status_code == 200, r.text
        items = r.json().get("items") or []
        assert "Hello Ticker World" in items

    def test_public_ticker_items_nonexistent_scene(self):
        r = requests.get(f"{BASE_URL}/api/public/scene/bogus-token/ticker/bogus", timeout=10)
        assert r.status_code == 404

    def test_overlay_html_contains_ticker(self, scene):
        token = scene["public_token"]
        r = requests.get(f"{BASE_URL}/api/public/scene/{token}/overlay", timeout=10)
        assert r.status_code == 200, r.text
        html = r.text
        assert "clara-ticker" in html
        # Ticker branch and keyframe present
        assert "type==='ticker'" in html or "'ticker'" in html


class TestRegression:
    def test_sources_values_ok(self, client):
        r = client.get(f"{BASE_URL}/api/sources/values", params={"workspace_id": TARGET_WS}, timeout=10)
        assert r.status_code == 200
        # should be a dict (sourceId -> fields)
        assert isinstance(r.json(), (dict, list))

    def test_overlay_export_root(self, client):
        r = client.get(f"{BASE_URL}/api/scenes", params={"workspace_id": TARGET_WS}, timeout=10)
        assert r.status_code == 200
        scenes = r.json()
        if not scenes:
            pytest.skip("no scenes to regression-test")
        token = scenes[0].get("public_token")
        if not token:
            pytest.skip("scene has no public_token")
        r2 = requests.get(f"{BASE_URL}/api/public/scene/{token}/overlay", timeout=10)
        assert r2.status_code == 200
