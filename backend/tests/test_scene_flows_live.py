"""Tests for iteration 18 features:
- PUT /api/submissions/{sid} (inline edit of submission data)
- Scene flow enabled/disabled + per-pancarte toggles persistence
- Scene background 'stream' (vimeo / hls) persistence
- Overlay HTML contains: overlap timing JS, flow disabled guard, hls.js script, vimeo embed.
"""
import os, uuid, pyotp, pytest, requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]).strip().rstrip("/")
EMAIL = "yannick.gijbels@koodh.com"
PASSWORD = "KYLovie13monx"
TOTP_SECRET = "NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY"
WORKSPACE_ID = "83e9d223-ae96-4e12-a0ff-198a959582c5"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("mfa_required"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{BASE}/api/auth/mfa/verify", json={"mfa_ticket": body["mfa_ticket"], "code": code}, timeout=15)
        assert r2.status_code == 200, r2.text
    me = s.get(f"{BASE}/api/auth/me", timeout=10)
    assert me.status_code == 200
    return s


@pytest.fixture(scope="module")
def created(client):
    """Create a form + submission + 2 pancartes + flow + scene for later tests. Teardown at end."""
    created_ids = {"forms": [], "subs": [], "pans": [], "flows": [], "scenes": []}

    # Form (with a public submission endpoint)
    r = client.post(f"{BASE}/api/forms", json={
        "name": "TEST_InlineEdit",
        "workspace_id": WORKSPACE_ID,
        "fields": [{"key": "name", "type": "text", "label": "Naam"},
                   {"key": "msg", "type": "text", "label": "Bericht"}],
    }, timeout=10)
    assert r.status_code in (200, 201), r.text
    form = r.json()
    created_ids["forms"].append(form["id"])

    # Public submission (uses form.public_token)
    token = form.get("public_token") or form.get("token")
    assert token
    r = requests.post(f"{BASE}/api/public/form/{token}/submit",
                      json={"data": {"name": "Alice", "msg": "Hello"}}, timeout=10)
    assert r.status_code in (200, 201), r.text
    sub = r.json()
    sid = sub.get("id") or sub.get("submission", {}).get("id")
    if not sid:
        # fallback: list submissions
        r2 = client.get(f"{BASE}/api/submissions?workspace_id={WORKSPACE_ID}", timeout=10)
        subs = r2.json()
        sid = subs[0]["id"]
    created_ids["subs"].append(sid)

    # Two pancartes
    pans = []
    for i in range(2):
        r = client.post(f"{BASE}/api/pancartes", json={
            "name": f"TEST_Pan_{i}",
            "workspace_id": WORKSPACE_ID,
            "elements": [{"id": str(uuid.uuid4()), "type": "text",
                          "props": {"text": f"pan{i}", "x": 10, "y": 10, "w": 100, "h": 40}}]
        }, timeout=10)
        assert r.status_code in (200, 201), r.text
        pans.append(r.json())
        created_ids["pans"].append(r.json()["id"])

    # Flow with 2 pancartes
    r = client.post(f"{BASE}/api/flows", json={
        "name": "TEST_Flow",
        "workspace_id": WORKSPACE_ID,
        "pancarte_ids": [p["id"] for p in pans],
        "transition": "fade",
        "durationSec": 5
    }, timeout=10)
    assert r.status_code in (200, 201), r.text
    flow = r.json()
    created_ids["flows"].append(flow["id"])

    # Scene with the flow placed, one disabled pancarte, and a vimeo stream background
    scene_payload = {
        "name": "TEST_FlowStreamScene",
        "workspace_id": WORKSPACE_ID,
        "width": 1920, "height": 1080,
        "elements": [],
        "flows": [{
            "id": str(uuid.uuid4()),
            "flow_id": flow["id"],
            "x": 100, "y": 100, "w": 600, "h": 200,
            "enabled": True,
            "disabledPancartes": [pans[1]["id"]],
            "when": "timed",
            "everyMin": 5,
            "showSec": 15,
        }],
        "background": {"type": "stream", "stream": "vimeo", "src": "https://vimeo.com/76979871"},
    }
    r = client.post(f"{BASE}/api/scenes", json=scene_payload, timeout=10)
    assert r.status_code in (200, 201), r.text
    scene = r.json()
    created_ids["scenes"].append(scene["id"])

    yield {
        "form": form, "sid": sid, "pans": pans, "flow": flow, "scene": scene, "ids": created_ids,
    }

    # Teardown
    for sid_ in created_ids["subs"]:
        client.delete(f"{BASE}/api/submissions/{sid_}")
    for fid in created_ids["forms"]:
        client.delete(f"{BASE}/api/forms/{fid}")
    for sid_ in created_ids["scenes"]:
        client.delete(f"{BASE}/api/scenes/{sid_}")
    for fid in created_ids["flows"]:
        client.delete(f"{BASE}/api/flows/{fid}")
    for pid in created_ids["pans"]:
        client.delete(f"{BASE}/api/pancartes/{pid}")


# ----- Submission inline edit -----
class TestSubmissionEdit:
    def test_edit_requires_auth(self, created):
        sid = created["sid"]
        r = requests.put(f"{BASE}/api/submissions/{sid}", json={"data": {"name": "x"}}, timeout=10)
        assert r.status_code in (401, 403)

    def test_edit_updates_and_persists(self, client, created):
        sid = created["sid"]
        new_data = {"name": "Alice Edited", "msg": "Updated"}
        r = client.put(f"{BASE}/api/submissions/{sid}", json={"data": new_data}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"]["name"] == "Alice Edited"
        assert body["data"]["msg"] == "Updated"
        assert "_id" not in body
        # Reload
        r2 = client.get(f"{BASE}/api/submissions?workspace_id={WORKSPACE_ID}", timeout=10)
        rows = r2.json()
        found = [s for s in rows if s["id"] == sid]
        assert found and found[0]["data"]["name"] == "Alice Edited"

    def test_edit_404_for_unknown(self, client):
        r = client.put(f"{BASE}/api/submissions/nonexistent-{uuid.uuid4()}",
                       json={"data": {"x": "y"}}, timeout=10)
        assert r.status_code == 404

    def test_edit_requires_data_object(self, client, created):
        sid = created["sid"]
        r = client.put(f"{BASE}/api/submissions/{sid}", json={}, timeout=10)
        assert r.status_code == 400


# ----- Scene flow fields + background persistence -----
class TestSceneFlowPersistence:
    def test_scene_persists_enabled_and_disabledPancartes(self, client, created):
        scene_id = created["scene"]["id"]
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        assert r.status_code == 200
        s = r.json()
        assert s["flows"] and s["flows"][0]["enabled"] is True
        assert s["flows"][0]["disabledPancartes"] == [created["pans"][1]["id"]]

    def test_toggle_flow_disabled(self, client, created):
        scene_id = created["scene"]["id"]
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        s = r.json()
        s["flows"][0]["enabled"] = False
        r2 = client.put(f"{BASE}/api/scenes/{scene_id}", json=s, timeout=10)
        assert r2.status_code == 200
        r3 = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        assert r3.json()["flows"][0]["enabled"] is False
        # revert
        s["flows"][0]["enabled"] = True
        client.put(f"{BASE}/api/scenes/{scene_id}", json=s, timeout=10)

    def test_scene_persists_stream_background(self, client, created):
        scene_id = created["scene"]["id"]
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        bg = r.json().get("background") or {}
        assert bg.get("type") == "stream"
        assert bg.get("stream") == "vimeo"
        assert "vimeo.com" in bg.get("src", "")

    def test_switch_stream_to_hls(self, client, created):
        scene_id = created["scene"]["id"]
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        s = r.json()
        s["background"] = {"type": "stream", "stream": "hls",
                            "src": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}
        r2 = client.put(f"{BASE}/api/scenes/{scene_id}", json=s, timeout=10)
        assert r2.status_code == 200
        r3 = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        bg = r3.json()["background"]
        assert bg["stream"] == "hls" and bg["src"].endswith(".m3u8")


# ----- Overlay HTML contents -----
class TestOverlayHtml:
    def test_overlay_contains_new_blocks(self, client, created):
        scene_id = created["scene"]["id"]
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        token = r.json()["public_token"]
        r2 = requests.get(f"{BASE}/api/public/scene/{token}/overlay", timeout=15)
        assert r2.status_code == 200
        html = r2.text
        # overlap timing (intro) branch
        assert "on && phase<introSec" in html
        # disabled-flow guard
        assert "pl.enabled===false" in html
        # hls.js script
        assert "hls.js@1" in html
        # vimeo embed handling
        assert "player.vimeo.com" in html

    def test_overlay_renders_with_hls_background(self, client, created):
        scene_id = created["scene"]["id"]
        # ensure hls bg (set by prior test, but set again for safety)
        r = client.get(f"{BASE}/api/scenes/{scene_id}", timeout=10)
        s = r.json()
        s["background"] = {"type": "stream", "stream": "hls",
                            "src": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"}
        client.put(f"{BASE}/api/scenes/{scene_id}", json=s, timeout=10)
        token = s["public_token"]
        r2 = requests.get(f"{BASE}/api/public/scene/{token}/overlay", timeout=15)
        assert r2.status_code == 200
        assert "hls.js@1" in r2.text
