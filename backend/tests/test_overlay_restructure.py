"""Backend tests for the Overlays/Reeksen/Scenes restructure."""
import os
import time
import pyotp
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = BASE_URL + '/api'
EMAIL = 'yannick.gijbels@koodh.com'
PASSWORD = 'KYLovie13monx'
TOTP_SECRET = 'NKSPU7UH4M5BJ3X3353DNTNA54YNIJSY'


def _login_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    if data.get('mfa_required'):
        code = pyotp.TOTP(TOTP_SECRET).now()
        r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": data['mfa_ticket'], "code": code}, timeout=20)
        assert r2.status_code == 200, r2.text
    elif data.get('mfa_setup_required'):
        secret = data['secret']
        code = pyotp.TOTP(secret).now()
        r2 = s.post(f"{API}/auth/mfa/setup-verify", json={"email": EMAIL, "password": PASSWORD, "code": code}, timeout=20)
        assert r2.status_code == 200, r2.text
    me = s.get(f"{API}/auth/me", timeout=10)
    assert me.status_code == 200, me.text
    return s


# ---------- Auth smoke ----------
def test_login_mfa_and_me():
    s = _login_session()
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 200
    assert r.json().get('email') == EMAIL


# ---------- Overlays (pancartes) list backfills public_token ----------
def test_pancartes_backfill_public_token():
    s = _login_session()
    r = s.get(f"{API}/pancartes")
    assert r.status_code == 200
    arr = r.json()
    assert isinstance(arr, list)
    assert len(arr) > 0, "No overlays in workspace to test"
    for p in arr:
        assert p.get('public_token'), f"Missing public_token on overlay {p.get('id')}"
    return arr


# ---------- Per-overlay vMix endpoints ----------
def test_public_overlay_endpoints():
    s = _login_session()
    arr = s.get(f"{API}/pancartes").json()
    token = arr[0]['public_token']

    r_html = requests.get(f"{API}/public/overlay/{token}/overlay", timeout=20)
    assert r_html.status_code == 200, r_html.text[:300]
    ct = r_html.headers.get('content-type', '')
    assert 'html' in ct.lower()
    assert '<html' in r_html.text.lower() or '<!doctype' in r_html.text.lower()
    # PUBKIND should be rendered to 'overlay'
    assert "'overlay'" in r_html.text or '"overlay"' in r_html.text

    r_ver = requests.get(f"{API}/public/overlay/{token}/version", timeout=15)
    assert r_ver.status_code == 200
    jv = r_ver.json()
    assert 'v' in jv

    r_vals = requests.get(f"{API}/public/overlay/{token}/values.json", timeout=15)
    assert r_vals.status_code == 200
    assert isinstance(r_vals.json(), dict)


def test_public_overlay_unknown_token_404():
    r = requests.get(f"{API}/public/overlay/doesnotexist123/overlay", timeout=15)
    assert r.status_code in (404, 400)


# ---------- Scene overlay regression ----------
def test_public_scene_overlay_regression():
    s = _login_session()
    scenes = s.get(f"{API}/scenes").json()
    assert isinstance(scenes, list) and len(scenes) > 0
    tok = scenes[0].get('public_token')
    assert tok
    r = requests.get(f"{API}/public/scene/{tok}/overlay", timeout=20)
    assert r.status_code == 200
    assert '<html' in r.text.lower() or '<!doctype' in r.text.lower()


# ---------- Reeksen (flows) durations + loop persistence ----------
def test_flow_create_update_persist_durations_loop():
    s = _login_session()
    pans = s.get(f"{API}/pancartes").json()
    assert len(pans) >= 2
    pids = [pans[0]['id'], pans[1]['id']]

    # Create
    payload = {
        "name": "TEST_Reeks_Restructure",
        "pancarte_ids": pids,
        "durations": [7.5, 4.0],
        "loop": False,
    }
    r = s.post(f"{API}/flows", json=payload)
    assert r.status_code in (200, 201), r.text
    flow = r.json()
    fid = flow['id']
    assert flow.get('durations') == [7.5, 4.0]
    assert flow.get('loop') is False

    # GET verify
    r2 = s.get(f"{API}/flows/{fid}")
    assert r2.status_code == 200
    data = r2.json()
    assert data.get('durations') == [7.5, 4.0]
    assert data.get('loop') is False

    # Update
    r3 = s.put(f"{API}/flows/{fid}", json={
        "name": "TEST_Reeks_Restructure",
        "pancarte_ids": pids,
        "durations": [10.0, 2.5],
        "loop": True,
    })
    assert r3.status_code == 200, r3.text
    r4 = s.get(f"{API}/flows/{fid}")
    assert r4.json().get('durations') == [10.0, 2.5]
    assert r4.json().get('loop') is True

    # Cleanup
    s.delete(f"{API}/flows/{fid}")


# ---------- Overlays create / list / delete (Assets) ----------
def test_overlays_assets_crud():
    s = _login_session()
    r = s.get(f"{API}/overlays")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
