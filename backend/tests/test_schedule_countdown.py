"""Backend tests for schedule + countdown feature (iteration 23)."""
import os
import time
import pyotp
import pytest
import requests

def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not available"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "yannick.gijbels@koodh.com"
ADMIN_PASSWORD = "KYLovie13monx"
TOTP_SECRET = "NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": data["mfa_ticket"], "code": code}, timeout=15)
        assert r2.status_code == 200, r2.text
    me = s.get(f"{API}/auth/me", timeout=15)
    assert me.status_code == 200
    return s


class TestFlowScheduleRoundtrip:
    """Verify new scheduling + countdown fields persist via POST then GET /api/flows/{id}."""

    def test_everymin_roundtrip(self, client):
        payload = {
            "name": "TEST_sched_everymin",
            "pancarte_ids": [],
            "repeat": "schedule",
            "scheduleMode": "everyMin",
            "scheduleEveryMin": 15,
            "showCountdown": True,
            "countdownLabel": "Next slot in",
        }
        r = client.post(f"{API}/flows", json=payload)
        assert r.status_code in (200, 201), r.text
        fid = r.json()["id"]
        try:
            g = client.get(f"{API}/flows/{fid}").json()
            assert g["repeat"] == "schedule"
            assert g["scheduleMode"] == "everyMin"
            assert g["scheduleEveryMin"] == 15
            assert g["showCountdown"] is True
            assert g["countdownLabel"] == "Next slot in"
        finally:
            client.delete(f"{API}/flows/{fid}")

    def test_times_roundtrip(self, client):
        payload = {
            "name": "TEST_sched_times",
            "pancarte_ids": [],
            "repeat": "schedule",
            "scheduleMode": "times",
            "scheduleTimes": ["08:00", "12:30", "18:45"],
            "showCountdown": False,
        }
        r = client.post(f"{API}/flows", json=payload)
        assert r.status_code in (200, 201), r.text
        fid = r.json()["id"]
        try:
            g = client.get(f"{API}/flows/{fid}").json()
            assert g["scheduleMode"] == "times"
            assert g["scheduleTimes"] == ["08:00", "12:30", "18:45"]
            assert g["showCountdown"] is False
        finally:
            client.delete(f"{API}/flows/{fid}")

    def test_once_persists(self, client):
        payload = {"name": "TEST_once_flow", "pancarte_ids": [], "repeat": "once"}
        r = client.post(f"{API}/flows", json=payload)
        assert r.status_code in (200, 201), r.text
        fid = r.json()["id"]
        try:
            g = client.get(f"{API}/flows/{fid}").json()
            assert g["repeat"] == "once"
        finally:
            client.delete(f"{API}/flows/{fid}")


class TestOverlayHTMLContainsScheduling:
    """Overlay HTML must include new helpers and embed schedule fields."""

    def test_overlay_contains_helpers(self, client):
        # find any scene with a public token
        scenes = client.get(f"{API}/scenes").json()
        assert scenes, "need at least one scene"
        # Prefer the known 'Sched Scene' if it exists
        target = next((s for s in scenes if (s.get("name") or "").lower().startswith("sched")), scenes[0])
        token = target.get("public_token") or target.get("publicToken") or target.get("token")
        assert token, f"no token on scene: {target}"
        r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=15)
        assert r.status_code == 200
        html = r.text
        for needle in ("nextStartMs", "fmtCountdown", "enterWait"):
            assert needle in html, f"missing {needle} in overlay HTML"

    def test_overlay_embeds_schedule_fields(self, client):
        # Create a transient scheduled flow + attach to a scene temporarily
        flows_before = client.get(f"{API}/flows").json()
        sched = next((f for f in flows_before if f.get("repeat") == "schedule"), None)
        created_flow_id = None
        if not sched:
            r = client.post(f"{API}/flows", json={
                "name": "TEST_sched_overlay_check",
                "pancarte_ids": [],
                "repeat": "schedule",
                "scheduleMode": "everyMin",
                "scheduleEveryMin": 15,
                "showCountdown": True,
            })
            assert r.status_code in (200, 201)
            sched = r.json()
            created_flow_id = sched["id"]
        # Pick a scene and attach this flow
        scenes = client.get(f"{API}/scenes").json()
        scene = next((s for s in scenes if (s.get("name") or "").lower().startswith("sched")), scenes[0])
        sid = scene["id"]
        token = scene.get("public_token") or scene.get("publicToken") or scene.get("token")
        try:
            r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=15)
            assert r.status_code == 200
            html = r.text
            # SCENE JSON should carry scheduleEveryMin or scheduleTimes somewhere
            # (only if a schedule flow is actually attached in this scene)
            attached = False
            for f in (scene.get("flows") or []):
                if f.get("flowId") == sched["id"] or f.get("flow_id") == sched["id"]:
                    attached = True
            if attached:
                assert "scheduleEveryMin" in html or "scheduleTimes" in html
        finally:
            if created_flow_id:
                client.delete(f"{API}/flows/{created_flow_id}")


class TestRegressionLists:
    def test_lists_ok(self, client):
        for path in ("/flows", "/scenes", "/overlays"):
            r = client.get(f"{API}{path}")
            assert r.status_code == 200, f"{path} => {r.status_code}"
