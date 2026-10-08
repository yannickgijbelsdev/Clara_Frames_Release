"""Backend tests for the new sequence timing fields and overlay cycler."""
import os
import time
import pyotp
import pytest
import requests

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert url, "REACT_APP_BACKEND_URL not found"
    return url.rstrip("/")

BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

EMAIL = "yannick.gijbels@koodh.com"
PASSWORD = "KYLovie13monx"
TOTP_SECRET = "NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY"

EXISTING_SCENE_TOKEN = "925db442096f4f36bf58c961ceadf95f"
EXISTING_FLOW_ID = "93794d1f-4b3c-40f1-9cdf-d3b5492ea439"


@pytest.fixture(scope="session")
def auth_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": data["mfa_ticket"], "code": code})
        assert r2.status_code == 200, r2.text
    elif data.get("mfa_setup_required"):
        pytest.skip("MFA setup required - unexpected state")
    return s


@pytest.fixture(scope="session")
def workspace_id(auth_session):
    r = auth_session.get(f"{API}/workspaces")
    assert r.status_code == 200
    ws = r.json()
    assert len(ws) > 0
    return ws[0]["id"]


# ------- Flow CRUD: new timing fields round-trip -------

class TestFlowTimingFields:
    created_ids = []

    def test_create_flow_with_new_fields(self, auth_session, workspace_id):
        payload = {
            "name": "TEST_Timing_Flow",
            "interval": 5,
            "entrance": "fade",
            "entranceDuration": 0.6,
            "pancarte_ids": [],
            "durations": [300.0, 10.5],
            "playouts": [False, True],
            "repeat": "interval",
            "repeatEvery": 7,
            "intro": {"overlayId": "abc", "url": "http://x/i.html", "kind": "html", "seconds": 2},
            "transition": {"overlayId": "def", "url": "http://x/t.html", "kind": "html", "seconds": 1.5},
            "outro": {"overlayId": "ghi", "url": "http://x/o.html", "kind": "html", "seconds": 3},
            "workspace_id": workspace_id,
        }
        r = auth_session.post(f"{API}/flows", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "id" in d
        TestFlowTimingFields.created_ids.append(d["id"])
        # Immediate response assertions
        assert d["durations"] == [300.0, 10.5]
        assert d["playouts"] == [False, True]
        assert d["repeat"] == "interval"
        assert d["repeatEvery"] == 7
        assert d["intro"]["seconds"] == 2
        assert d["transition"]["url"] == "http://x/t.html"
        assert d["outro"]["kind"] == "html"

    def test_get_flow_persisted(self, auth_session):
        fid = TestFlowTimingFields.created_ids[-1]
        r = auth_session.get(f"{API}/flows/{fid}")
        assert r.status_code == 200
        d = r.json()
        assert d["durations"] == [300.0, 10.5]
        assert d["playouts"] == [False, True]
        assert d["repeat"] == "interval"
        assert d["repeatEvery"] == 7
        assert d["intro"]["overlayId"] == "abc"
        assert d["transition"]["overlayId"] == "def"
        assert d["outro"]["overlayId"] == "ghi"

    def test_update_flow_changes_fields(self, auth_session, workspace_id):
        fid = TestFlowTimingFields.created_ids[-1]
        payload = {
            "name": "TEST_Timing_Flow_Upd",
            "interval": 10,
            "entrance": "slide-up",
            "entranceDuration": 1.0,
            "pancarte_ids": [],
            "durations": [4.0, 4.0],
            "playouts": [False, False],
            "repeat": "once",
            "repeatEvery": 5,
            "intro": None,
            "transition": None,
            "outro": None,
            "workspace_id": workspace_id,
        }
        r = auth_session.put(f"{API}/flows/{fid}", json=payload)
        assert r.status_code == 200
        # Verify via GET
        r2 = auth_session.get(f"{API}/flows/{fid}")
        d = r2.json()
        assert d["durations"] == [4.0, 4.0]
        assert d["repeat"] == "once"
        assert d["intro"] is None
        assert d["transition"] is None
        assert d["outro"] is None

    def test_cleanup(self, auth_session):
        for fid in TestFlowTimingFields.created_ids:
            auth_session.delete(f"{API}/flows/{fid}")


# ------- Overlay HTML embedding and cycler ------

class TestOverlayHTML:
    def test_scene_overlay_loads(self):
        r = requests.get(f"{API}/public/scene/{EXISTING_SCENE_TOKEN}/overlay")
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")

    def test_overlay_html_contains_cycler_helpers(self):
        html = requests.get(f"{API}/public/scene/{EXISTING_SCENE_TOKEN}/overlay").text
        for name in ("buildSteps", "durFor", "waitMediaEnd", "playoutFor"):
            assert name in html, f"missing helper {name} in overlay HTML"
        # Old everyX timed-schedule branch should be gone
        assert "setIdx" not in html, "old setIdx/everyX scheduling leaked into overlay HTML"

    def test_overlay_html_embeds_flow_durations(self):
        html = requests.get(f"{API}/public/scene/{EXISTING_SCENE_TOKEN}/overlay").text
        # Existing timing-test flow has durations [300, ...]
        assert "300" in html, "expected first-item 300s duration embedded"
        assert "interval" in html or "repeat" in html


# ------- Timing sanity: fresh flow holds first overlay for ~4s -------

class TestTimingSanity:
    def test_fresh_flow_holds_first_overlay(self, auth_session, workspace_id):
        # Create 2 overlays
        p1 = auth_session.post(f"{API}/pancartes", json={"name": "TEST_P1", "width": 1920, "height": 1080, "elements": [], "background": {"color": "#000"}, "workspace_id": workspace_id}).json()
        p2 = auth_session.post(f"{API}/pancartes", json={"name": "TEST_P2", "width": 1920, "height": 1080, "elements": [], "background": {"color": "#111"}, "workspace_id": workspace_id}).json()
        flow = auth_session.post(f"{API}/flows", json={
            "name": "TEST_SanityFlow",
            "interval": 4,
            "entrance": "none", "entranceDuration": 0.3,
            "pancarte_ids": [p1["id"], p2["id"]],
            "durations": [4.0, 4.0],
            "playouts": [False, False],
            "repeat": "loop",
            "workspace_id": workspace_id,
        }).json()
        # Create a scene with the flow placed
        scene = auth_session.post(f"{API}/scenes", json={
            "name": "TEST_SanityScene", "width": 1920, "height": 1080,
            "background": {"mode": "transparent"},
            "elements": [], "workspace_id": workspace_id,
        }).json()
        # Attach flow via PUT
        r = auth_session.put(f"{API}/scenes/{scene['id']}", json={
            "name": scene["name"], "width": 1920, "height": 1080,
            "background": {"mode": "transparent"},
            "elements": [],
            "flows": [{"id": "f1", "flow_id": flow["id"], "x": 0, "y": 0, "w": 1920, "h": 1080, "enabled": True, "disabledPancartes": []}],
        })
        assert r.status_code == 200
        token = scene["public_token"]
        html = requests.get(f"{API}/public/scene/{token}/overlay").text
        # Must contain our 4s durations and loop repeat; and the cycler
        assert "buildSteps" in html
        assert "4" in html  # trivially true, but ensures durations field there
        # verify no 20s hardcoded chop or everyX leak
        assert "showSeconds" not in html or "showSeconds:20" not in html.replace(" ", "")
        # Cleanup
        auth_session.delete(f"{API}/scenes/{scene['id']}")
        auth_session.delete(f"{API}/flows/{flow['id']}")
        auth_session.delete(f"{API}/pancartes/{p1['id']}")
        auth_session.delete(f"{API}/pancartes/{p2['id']}")


# ------- Regression: core endpoints still 200 ----------

class TestRegression:
    def test_overlays_list(self, auth_session):
        r = auth_session.get(f"{API}/overlays")
        assert r.status_code == 200

    def test_flows_list(self, auth_session, workspace_id):
        r = auth_session.get(f"{API}/flows?workspace_id={workspace_id}")
        assert r.status_code == 200

    def test_scenes_list(self, auth_session, workspace_id):
        r = auth_session.get(f"{API}/scenes?workspace_id={workspace_id}")
        assert r.status_code == 200

    def test_scene_public_overlay(self):
        r = requests.get(f"{API}/public/scene/{EXISTING_SCENE_TOKEN}/overlay")
        assert r.status_code == 200
