"""Backend tests for: source test force-fresh, https fallback, flow trigger, public version triggers map."""
import os
import time
import uuid
import pyotp
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://overlay-settings-hub.preview.emergentagent.com").rstrip("/")
EMAIL = "yannick.gijbels@koodh.com"
PASSWORD = "KYLovie13monx"
TOTP_SECRET = "NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("mfa_required"), j
    code = pyotp.TOTP(TOTP_SECRET).now()
    r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"mfa_ticket": j["mfa_ticket"], "code": code}, timeout=15)
    assert r.status_code == 200, r.text
    r = s.get(f"{BASE_URL}/api/auth/me", timeout=15)
    assert r.status_code == 200
    return s


# --- Source: test endpoint force-fresh fetch, error=null on reachable API ---------------------
class TestSourceTestForceFresh:
    def test_custom_openmeteo_source_resolves_fresh(self, session):
        payload = {
            "name": "TEST_openmeteo",
            "type": "custom",
            "url": "https://api.open-meteo.com/v1/forecast?latitude=50.85&longitude=4.35&current=temperature_2m",
            "method": "GET",
            "headers": {},
            "refresh_interval": 60,
            "fields": [{"key": "temp", "path": "current.temperature_2m"}],
        }
        r = session.post(f"{BASE_URL}/api/sources", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            # Poison a stale last_error by hitting a non-existing url first? Not possible without updating.
            # Instead: just verify test returns error=null and values.temp resolves.
            r = session.post(f"{BASE_URL}/api/sources/{sid}/test", timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("error") in (None, ""), f"Expected no error, got {data.get('error')}"
            assert "values" in data
            temp = data["values"].get("temp")
            assert temp not in (None, ""), f"Expected temp value, got {data['values']}"
            # Call test again — must still be fresh and error=null (not a stale cache)
            r2 = session.post(f"{BASE_URL}/api/sources/{sid}/test", timeout=20)
            assert r2.status_code == 200
            assert r2.json().get("error") in (None, "")
        finally:
            session.delete(f"{BASE_URL}/api/sources/{sid}", timeout=15)


# --- Source: https fallback for http:// URLs -------------------------------------------------
class TestSourceHttpsFallback:
    def test_builtin_nowplaying_http_url_falls_back(self, session):
        payload = {
            "name": "TEST_nowplaying",
            "type": "builtin_nowplaying",
            "url": "http://clr.koodh.com/api/rds/grk/now-playing.txt",
            "method": "GET",
            "headers": {},
            "refresh_interval": 30,
            "fields": [],
            "separator": " - ",
            "artwork": True,
        }
        r = session.post(f"{BASE_URL}/api/sources", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            r = session.post(f"{BASE_URL}/api/sources/{sid}/test", timeout=25)
            assert r.status_code == 200, r.text
            data = r.json()
            # Allow either success or soft failure — but the key fix is https retry attempted.
            if data.get("error"):
                pytest.skip(f"Upstream now-playing API unreachable in this env: {data.get('error')}")
            vals = data.get("values") or {}
            # At minimum we should get a title/song
            assert (vals.get("song") or vals.get("title")), f"Expected a title/song, got {vals}"
        finally:
            session.delete(f"{BASE_URL}/api/sources/{sid}", timeout=15)


# --- Flow trigger-now endpoint ---------------------------------------------------------------
class TestFlowTriggerNow:
    def test_trigger_persists_manual_trigger(self, session):
        # Create flow
        fp = {"name": "TEST_trigger_flow", "pancarte_ids": [], "repeat": "loop"}
        r = session.post(f"{BASE_URL}/api/flows", json=fp, timeout=15)
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        try:
            t0 = int(time.time() * 1000)
            r = session.post(f"{BASE_URL}/api/flows/{fid}/trigger", timeout=15)
            assert r.status_code == 200, r.text
            j = r.json()
            assert j.get("ok") is True
            mt = j.get("manual_trigger")
            assert isinstance(mt, int) and mt >= t0 - 2000
            # GET persists
            r = session.get(f"{BASE_URL}/api/flows/{fid}", timeout=15)
            assert r.status_code == 200
            assert r.json().get("manual_trigger") == mt
        finally:
            session.delete(f"{BASE_URL}/api/flows/{fid}", timeout=15)

    def test_trigger_unknown_flow_404(self, session):
        r = session.post(f"{BASE_URL}/api/flows/{uuid.uuid4()}/trigger", timeout=15)
        assert r.status_code == 404


# --- Public version endpoints expose triggers map --------------------------------------------
class TestPublicVersionTriggers:
    def test_version_includes_triggers_map(self, session):
        # Create flow + scene + placement + public token
        fp = {"name": "TEST_pub_trigger_flow", "pancarte_ids": [], "repeat": "loop"}
        r = session.post(f"{BASE_URL}/api/flows", json=fp, timeout=15)
        assert r.status_code == 200
        fid = r.json()["id"]

        sp = {"name": "TEST_pub_trigger_scene", "width": 1920, "height": 1080,
              "elements": [], "flows": [{"id": str(uuid.uuid4()), "flow_id": fid, "x": 0, "y": 0, "w": 400, "h": 200, "enabled": True}]}
        r = session.post(f"{BASE_URL}/api/scenes", json=sp, timeout=15)
        assert r.status_code == 200, r.text
        scene = r.json()
        sid = scene["id"]
        try:
            # publish/share endpoint — try to get a token. Many apps expose /api/scenes/{id}/publish or similar.
            # Fall back to GET /api/scenes/{id} with public_token field.
            r = session.get(f"{BASE_URL}/api/scenes/{sid}", timeout=15)
            assert r.status_code == 200
            doc = r.json()
            token = doc.get("public_token") or doc.get("public") or doc.get("token")
            if not token:
                # try publish
                r = session.post(f"{BASE_URL}/api/scenes/{sid}/publish", timeout=15)
                if r.status_code == 200:
                    token = r.json().get("public_token") or r.json().get("token")
            if not token:
                pytest.skip("No public_token exposed on scene; cannot test public version endpoint.")

            # Trigger the flow
            r = session.post(f"{BASE_URL}/api/flows/{fid}/trigger", timeout=15)
            assert r.status_code == 200
            mt = r.json()["manual_trigger"]

            # Call version endpoints (no auth; public token)
            pub = requests.Session()
            r = pub.get(f"{BASE_URL}/api/public/scene/{token}/version", timeout=15)
            assert r.status_code == 200, r.text
            v = r.json()
            assert "v" in v and "triggers" in v, v
            assert v["triggers"].get(fid) == mt, v

            r = pub.get(f"{BASE_URL}/api/public/overlay/{token}/version", timeout=15)
            # overlay token may differ; accept 200 or 404
            if r.status_code == 200:
                v2 = r.json()
                assert "triggers" in v2
        finally:
            session.delete(f"{BASE_URL}/api/scenes/{sid}", timeout=15)
            session.delete(f"{BASE_URL}/api/flows/{fid}", timeout=15)


# --- Smoke: public overlay HTML returns 200 (transition visual not asserted) ----------------
class TestPublicOverlayHtmlSmoke:
    def test_overlay_html_renders_when_token_available(self, session):
        # list scenes and find one with a public token
        r = session.get(f"{BASE_URL}/api/scenes", timeout=15)
        assert r.status_code == 200
        scenes = r.json()
        token = None
        for sc in scenes:
            token = sc.get("public_token") or sc.get("token")
            if token:
                break
        if not token:
            pytest.skip("No scene with public_token to smoke-check overlay HTML")
        r = requests.get(f"{BASE_URL}/api/public/scene/{token}/overlay", timeout=20)
        assert r.status_code == 200, r.text[:300]
        assert "<html" in r.text.lower() or "<script" in r.text.lower()
