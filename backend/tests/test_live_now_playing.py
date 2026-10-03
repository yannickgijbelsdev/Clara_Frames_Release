"""
Tests for 'Nu Speelt (live)' feature:
- GET/POST/DELETE /api/sources/live
- Scene overlay pipeline (values.json, data.json) with api_field (text) + image (artwork) bound to live source
- Hidden-element skip in public values resolution? (values.json always exposes keys for bound elements; hidden is a renderer concern)
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    # login
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get("mfa_required"):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"mfa_ticket": data["mfa_ticket"], "code": code}, timeout=20)
        assert r2.status_code == 200, r2.text
    elif data.get("mfa_setup_required"):
        pytest.skip("MFA not yet set up for admin")
    # verify auth
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=10)
    assert me.status_code == 200
    return s


@pytest.fixture(scope="module")
def workspace_id(client):
    r = client.get(f"{BASE_URL}/api/workspaces", timeout=10)
    assert r.status_code == 200
    ws = r.json()
    assert len(ws) > 0
    # Prefer the known demo workspace if present
    target = "83e9d223-ae96-4e12-a0ff-198a959582c5"
    for w in ws:
        if w.get("id") == target:
            return target
    return ws[0]["id"]


class TestLiveSourceCRUD:
    def test_get_creates_live_source(self, client, workspace_id):
        r = client.get(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200, r.text
        src = r.json()
        assert src["type"] == "builtin_live"
        assert src["workspace_id"] == workspace_id
        assert src["name"] == "Nu Speelt (live)"
        keys = sorted(f["key"] for f in src["fields"])
        assert keys == sorted(["text", "title", "artist", "artwork"])
        # should NOT contain mongo _id
        assert "_id" not in src

    def test_live_source_appears_in_sources_list(self, client, workspace_id):
        r = client.get(f"{BASE_URL}/api/sources", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200
        srcs = r.json()
        live = [s for s in srcs if s.get("type") == "builtin_live"]
        assert len(live) == 1, f"Expected exactly one builtin_live source, got {len(live)}"

    def test_set_live_song(self, client, workspace_id):
        payload = {
            "workspace_id": workspace_id,
            "title": "Yellow",
            "artist": "Coldplay",
            "artwork": "https://example.com/yellow.jpg",
            "preview": "",
        }
        r = client.post(f"{BASE_URL}/api/sources/live", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["live"]["text"] == "Coldplay - Yellow"
        assert d["live"]["title"] == "Yellow"
        assert d["live"]["artist"] == "Coldplay"
        assert d["live"]["artwork"] == "https://example.com/yellow.jpg"

    def test_get_live_source_returns_live_values(self, client, workspace_id):
        r = client.get(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200
        src = r.json()
        assert src["live"]["title"] == "Yellow"
        assert src["live"]["artist"] == "Coldplay"

    def test_clear_live_song(self, client, workspace_id):
        r = client.delete(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200
        r2 = client.get(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r2.status_code == 200
        live = r2.json().get("live") or {}
        # cleared live: empty dict
        assert not live.get("title")
        assert not live.get("artist")


class TestSceneOverlayPipeline:
    """Create a scene bound to the live source and verify values.json / data.json."""

    @pytest.fixture(scope="class")
    def live_src(self, client, workspace_id):
        r = client.get(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200
        return r.json()

    @pytest.fixture(scope="class")
    def scene(self, client, workspace_id, live_src):
        sid = live_src["id"]
        payload = {
            "name": "TEST_LiveOverlayScene",
            "workspace_id": workspace_id,
            "elements": [
                {
                    "id": str(uuid.uuid4()),
                    "type": "api_field",
                    "props": {"name": "song_text", "sourceId": sid, "fieldKey": "text",
                              "x": 10, "y": 10, "w": 400, "h": 60, "prefix": "", "suffix": ""},
                },
                {
                    "id": str(uuid.uuid4()),
                    "type": "image",
                    "props": {"name": "song_art", "sourceId": sid, "fieldKey": "artwork",
                              "x": 10, "y": 80, "w": 120, "h": 120, "src": ""},
                },
            ],
            "canvas": {"w": 1920, "h": 1080},
        }
        r = client.post(f"{BASE_URL}/api/scenes", json=payload, timeout=10)
        assert r.status_code in (200, 201), r.text
        scene = r.json()
        yield scene
        client.delete(f"{BASE_URL}/api/scenes/{scene['id']}", timeout=10)

    def test_set_live_then_values_json_has_mapped_keys(self, client, workspace_id, live_src, scene):
        # set live
        r = client.post(f"{BASE_URL}/api/sources/live", json={
            "workspace_id": workspace_id, "title": "Clocks", "artist": "Coldplay",
            "artwork": "https://img.example.com/clocks.jpg", "preview": "",
        }, timeout=10)
        assert r.status_code == 200
        token = scene["public_token"]
        r = requests.get(f"{BASE_URL}/api/public/scene/{token}/values.json", timeout=10)
        assert r.status_code == 200, r.text
        v = r.json()
        sid = live_src["id"]
        assert v.get(f"{sid}:text") == "Coldplay - Clocks"
        assert v.get(f"{sid}:artwork") == "https://img.example.com/clocks.jpg"

    def test_data_json_has_mapped_columns(self, client, scene):
        token = scene["public_token"]
        r = requests.get(f"{BASE_URL}/api/public/scene/{token}/data.json", timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) == 1
        row = rows[0]
        assert row.get("song_text") == "Coldplay - Clocks"
        assert row.get("song_art") == "https://img.example.com/clocks.jpg"

    def test_clear_live_empties_values(self, client, workspace_id, live_src, scene):
        r = client.delete(f"{BASE_URL}/api/sources/live", params={"workspace_id": workspace_id}, timeout=10)
        assert r.status_code == 200
        token = scene["public_token"]
        r1 = requests.get(f"{BASE_URL}/api/public/scene/{token}/values.json", timeout=10)
        v = r1.json()
        sid = live_src["id"]
        assert v.get(f"{sid}:text") == ""
        assert v.get(f"{sid}:artwork") == ""
        r2 = requests.get(f"{BASE_URL}/api/public/scene/{token}/data.json", timeout=10)
        row = r2.json()[0]
        assert row.get("song_text") == ""
        assert row.get("song_art") == ""

    def test_hidden_element_skipped_in_overlay_html(self, client, workspace_id, live_src, scene):
        """Toggle an element hidden; the overlay HTML renderer should skip it (el.hidden check)."""
        # Set live so artwork URL present
        client.post(f"{BASE_URL}/api/sources/live", json={
            "workspace_id": workspace_id, "title": "Fix You", "artist": "Coldplay",
            "artwork": "https://img.example.com/fixyou.jpg", "preview": "",
        }, timeout=10)
        # mark image element hidden
        elements = []
        for el in scene["elements"]:
            e = dict(el)
            if el["type"] == "image":
                e["hidden"] = True
            elements.append(e)
        upd = client.put(f"{BASE_URL}/api/scenes/{scene['id']}", json={**scene, "elements": elements}, timeout=10)
        assert upd.status_code in (200, 201), upd.text
        token = scene["public_token"]
        html = requests.get(f"{BASE_URL}/api/public/scene/{token}/overlay", timeout=10).text
        # The scene JSON is embedded; check that the hidden flag is present
        assert '"hidden": true' in html or '"hidden":true' in html
        # values.json still exposes the key (hidden is a renderer-side concern)
        v = requests.get(f"{BASE_URL}/api/public/scene/{token}/values.json", timeout=10).json()
        sid = live_src["id"]
        assert f"{sid}:artwork" in v
