"""Iteration 9: Standalone Pancartes + Flows resources + scene flow placement + overlay."""
import os
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
TOTP_SECRET = "JBSWY3DPEHPK3PXP"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    ticket = r.json()["mfa_ticket"]
    code = pyotp.TOTP(TOTP_SECRET).now()
    r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code}, timeout=15)
    assert r2.status_code == 200, r2.text
    return s


@pytest.fixture(scope="module")
def workspace_id(admin_session):
    r = admin_session.get(f"{API}/workspaces", timeout=10)
    assert r.status_code == 200
    return r.json()[0]["id"]


# ---------- Pancartes CRUD ----------
class TestPancartesCRUD:
    def test_create_get_update_delete(self, admin_session, workspace_id):
        payload = {
            "name": "TEST_Panc_A",
            "workspace_id": workspace_id,
            "width": 800, "height": 200,
            "background": {"color": "#123456"},
            "elements": [
                {"id": "e1", "type": "text", "x": 10, "y": 20, "w": 300, "h": 60,
                 "props": {"text": "Hello", "fontSize": 40, "color": "#ffffff"}}
            ],
        }
        r = admin_session.post(f"{API}/pancartes", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        pan = r.json()
        assert pan["name"] == "TEST_Panc_A"
        assert pan["background"]["color"] == "#123456"
        assert len(pan["elements"]) == 1
        pid = pan["id"]

        # GET
        g = admin_session.get(f"{API}/pancartes/{pid}", timeout=10)
        assert g.status_code == 200
        assert g.json()["elements"][0]["props"]["text"] == "Hello"

        # LIST scoped by workspace
        lst = admin_session.get(f"{API}/pancartes", params={"workspace_id": workspace_id}, timeout=10)
        assert lst.status_code == 200
        assert any(p["id"] == pid for p in lst.json())

        # PUT
        upd = dict(payload, name="TEST_Panc_A_Updated", width=1024,
                   elements=[dict(payload["elements"][0], props={"text": "World", "fontSize": 32, "color": "#ff0000"})])
        r2 = admin_session.put(f"{API}/pancartes/{pid}", json=upd, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Panc_A_Updated"
        assert r2.json()["width"] == 1024
        # verify persistence
        g2 = admin_session.get(f"{API}/pancartes/{pid}", timeout=10).json()
        assert g2["elements"][0]["props"]["text"] == "World"

        # DELETE
        d = admin_session.delete(f"{API}/pancartes/{pid}", timeout=10)
        assert d.status_code == 200
        g3 = admin_session.get(f"{API}/pancartes/{pid}", timeout=10)
        assert g3.status_code == 404

    def test_get_404(self, admin_session):
        r = admin_session.get(f"{API}/pancartes/does-not-exist", timeout=10)
        assert r.status_code == 404


# ---------- Flows CRUD ----------
@pytest.fixture(scope="module")
def two_pancartes(admin_session, workspace_id):
    ids = []
    for i, txt in enumerate(["FirstCard", "SecondCard"]):
        r = admin_session.post(f"{API}/pancartes", json={
            "name": f"TEST_Flow_Panc_{i}",
            "workspace_id": workspace_id,
            "width": 600, "height": 200,
            "background": {"color": "#000000"},
            "elements": [{"id": f"t{i}", "type": "text", "x": 10, "y": 10, "w": 400, "h": 80,
                          "props": {"text": txt, "fontSize": 40, "color": "#ffffff"}}],
        }, timeout=10)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"])
    yield ids
    for pid in ids:
        admin_session.delete(f"{API}/pancartes/{pid}", timeout=10)


class TestFlowsCRUD:
    def test_flow_lifecycle(self, admin_session, workspace_id, two_pancartes):
        payload = {
            "name": "TEST_Flow_A",
            "workspace_id": workspace_id,
            "interval": 4,
            "entrance": "slide-up",
            "entranceDuration": 0.5,
            "pancarte_ids": two_pancartes,
        }
        r = admin_session.post(f"{API}/flows", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        fl = r.json()
        assert fl["pancarte_ids"] == two_pancartes
        fid = fl["id"]

        # GET
        g = admin_session.get(f"{API}/flows/{fid}", timeout=10).json()
        assert g["name"] == "TEST_Flow_A"
        assert g["interval"] == 4
        assert g["entrance"] == "slide-up"

        # LIST scoped by workspace
        lst = admin_session.get(f"{API}/flows", params={"workspace_id": workspace_id}, timeout=10)
        assert lst.status_code == 200
        assert any(f["id"] == fid for f in lst.json())

        # PUT reorder
        upd = dict(payload, name="TEST_Flow_A_Renamed", interval=8,
                   pancarte_ids=list(reversed(two_pancartes)))
        r2 = admin_session.put(f"{API}/flows/{fid}", json=upd, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["pancarte_ids"] == list(reversed(two_pancartes))
        assert r2.json()["interval"] == 8

        # DELETE
        d = admin_session.delete(f"{API}/flows/{fid}", timeout=10)
        assert d.status_code == 200
        assert admin_session.get(f"{API}/flows/{fid}", timeout=10).status_code == 404


# ---------- Scene with flow placement ----------
@pytest.fixture(scope="module")
def flow_and_pancartes(admin_session, workspace_id):
    # create 2 pancartes
    pids = []
    for i in range(2):
        r = admin_session.post(f"{API}/pancartes", json={
            "name": f"TEST_ScenePanc_{i}",
            "workspace_id": workspace_id,
            "width": 800, "height": 200,
            "background": {"color": "#222"},
            "elements": [{"id": f"txt{i}", "type": "text", "x": 20, "y": 40, "w": 500, "h": 120,
                          "props": {"text": f"ScenePanc{i}", "fontSize": 40, "color": "#fff"}}],
        }, timeout=10)
        pids.append(r.json()["id"])
    # create flow using them
    rf = admin_session.post(f"{API}/flows", json={
        "name": "TEST_SceneFlow", "workspace_id": workspace_id,
        "interval": 3, "entrance": "fade", "entranceDuration": 0.6, "pancarte_ids": pids,
    }, timeout=10)
    fid = rf.json()["id"]
    yield {"flow_id": fid, "pancarte_ids": pids}
    admin_session.delete(f"{API}/flows/{fid}", timeout=10)
    for pid in pids:
        admin_session.delete(f"{API}/pancartes/{pid}", timeout=10)


class TestSceneFlowPlacement:
    def test_scene_places_flow_and_overlay_expands(self, admin_session, workspace_id, flow_and_pancartes):
        fid = flow_and_pancartes["flow_id"]
        pids = flow_and_pancartes["pancarte_ids"]
        # create scene with flow placement
        scene_payload = {
            "name": "TEST_Scene_WithFlow",
            "workspace_id": workspace_id,
            "elements": [],
            "flows": [{
                "id": "pl1", "flow_id": fid,
                "x": 100, "y": 200, "w": 800, "h": 200,
                "schedule": {"mode": "always"},
            }],
        }
        rs = admin_session.post(f"{API}/scenes", json=scene_payload, timeout=10)
        assert rs.status_code == 200, rs.text
        scene = rs.json()
        sid = scene["id"]
        try:
            assert len(scene["flows"]) == 1
            assert scene["flows"][0]["flow_id"] == fid

            # GET scene should persist flow placement (expansion happens in public overlay only)
            gs = admin_session.get(f"{API}/scenes/{sid}", timeout=10).json()
            pl = gs["flows"][0]
            assert pl["flow_id"] == fid
            assert pl["x"] == 100 and pl["y"] == 200 and pl["w"] == 800 and pl["h"] == 200
            assert pl["schedule"]["mode"] == "always"

            # overlay HTML
            token = gs.get("public_token")
            assert token
            r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=15)
            assert r.status_code == 200
            html = r.text
            # overlay should reference the resolved pancarte content or flow structures
            assert "ScenePanc0" in html or "_pancartes" in html or "SCENE.flows" in html

            # update schedule to everyX
            upd = dict(scene_payload)
            upd["flows"] = [dict(scene_payload["flows"][0],
                                 schedule={"mode": "everyX", "everyMinutes": 5, "showSeconds": 20})]
            ru = admin_session.put(f"{API}/scenes/{sid}", json=upd, timeout=10)
            assert ru.status_code == 200, ru.text
            gs2 = admin_session.get(f"{API}/scenes/{sid}", timeout=10).json()
            sch = gs2["flows"][0]["schedule"]
            assert sch["mode"] == "everyX"
            assert sch["everyMinutes"] == 5
            assert sch["showSeconds"] == 20
        finally:
            admin_session.delete(f"{API}/scenes/{sid}", timeout=10)
