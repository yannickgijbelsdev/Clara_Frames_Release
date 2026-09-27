"""Iteration 8: Pancarte Flows persistence + overlay HTML rendering."""
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


def _flow_payload():
    return {
        "id": "fl_1",
        "name": "Speakers",
        "x": 120, "y": 800, "w": 700, "h": 140,
        "interval": 5,
        "entrance": "slide-up",
        "entranceDuration": 0.6,
        "schedule": {"mode": "everyX", "everyMinutes": 2, "showSeconds": 15},
        "style": {"cardColor": "#111827", "textColor": "#ffffff", "titleSize": 44, "subtitleSize": 22},
        "cards": [
            {"id": "c1", "title": "Alice Doe", "subtitle": "CEO — Acme", "image": ""},
            {"id": "c2", "title": "Bob Smith", "subtitle": "CTO — Acme", "image": ""},
        ],
    }


@pytest.fixture(scope="module")
def scene_with_flow(admin_session, workspace_id):
    payload = {
        "name": "TEST_Flows_Scene",
        "workspace_id": workspace_id,
        "elements": [],
        "flows": [_flow_payload()],
    }
    r = admin_session.post(f"{API}/scenes", json=payload, timeout=10)
    assert r.status_code == 200, r.text
    sc = r.json()
    yield sc
    admin_session.delete(f"{API}/scenes/{sc['id']}", timeout=10)


class TestFlowsPersistence:
    def test_post_returns_flows(self, scene_with_flow):
        assert isinstance(scene_with_flow.get("flows"), list)
        assert len(scene_with_flow["flows"]) == 1

    def test_get_returns_flows_intact(self, admin_session, scene_with_flow):
        r = admin_session.get(f"{API}/scenes/{scene_with_flow['id']}", timeout=10)
        assert r.status_code == 200
        sc = r.json()
        flows = sc.get("flows", [])
        assert len(flows) == 1
        fl = flows[0]
        assert fl["name"] == "Speakers"
        assert fl["interval"] == 5
        assert fl["entrance"] == "slide-up"
        assert fl["schedule"]["mode"] == "everyX"
        assert fl["schedule"]["everyMinutes"] == 2
        assert fl["schedule"]["showSeconds"] == 15
        assert len(fl["cards"]) == 2
        assert fl["cards"][0]["title"] == "Alice Doe"
        assert fl["cards"][1]["subtitle"] == "CTO — Acme"

    def test_put_updates_flows(self, admin_session, scene_with_flow):
        updated = dict(scene_with_flow)
        updated["flows"] = [dict(_flow_payload(), name="Renamed", cards=[
            {"id": "c1", "title": "Only One", "subtitle": "Solo", "image": ""}
        ])]
        # Strip workspace_id? PUT should accept full scene body
        r = admin_session.put(f"{API}/scenes/{scene_with_flow['id']}",
                              json={"name": updated["name"], "elements": updated.get("elements", []),
                                    "flows": updated["flows"], "background": updated.get("background", {}),
                                    "workspace_id": updated.get("workspace_id")}, timeout=10)
        assert r.status_code == 200, r.text
        # GET
        g = admin_session.get(f"{API}/scenes/{scene_with_flow['id']}", timeout=10)
        sc = g.json()
        assert sc["flows"][0]["name"] == "Renamed"
        assert len(sc["flows"][0]["cards"]) == 1


class TestBackwardCompat:
    def test_scene_without_flows(self, admin_session, workspace_id):
        r = admin_session.post(f"{API}/scenes", json={
            "name": "TEST_NoFlows_Scene", "workspace_id": workspace_id, "elements": []
        }, timeout=10)
        assert r.status_code == 200, r.text
        sc = r.json()
        assert sc.get("flows", []) == []
        g = admin_session.get(f"{API}/scenes/{sc['id']}", timeout=10)
        assert g.status_code == 200
        assert g.json().get("flows", []) == []
        admin_session.delete(f"{API}/scenes/{sc['id']}", timeout=10)


class TestOverlayHTML:
    def test_overlay_contains_flow_logic(self, admin_session, scene_with_flow):
        # get the public token from scene
        token = scene_with_flow.get("public_token") or scene_with_flow.get("token")
        if not token:
            # try refetching
            g = admin_session.get(f"{API}/scenes/{scene_with_flow['id']}", timeout=10).json()
            token = g.get("public_token") or g.get("token")
        assert token, "scene missing public_token"
        r = requests.get(f"{API}/public/scene/{token}/overlay", timeout=15)
        assert r.status_code == 200
        html = r.text
        assert "buildCard" in html
        assert "flowVis" in html
        assert "SCENE.flows" in html
        # everyX visibility uses Date.now()
        assert "Date.now" in html
        # entrance animation reference (clara-in-up for slide-up) or entranceAnim helper
        assert "clara-in-up" in html or "entranceAnim" in html
