"""Backend tests for the hosted public form page + new schema keys (search_url, result_fields)."""
import os
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TOTP = pyotp.TOTP("JBSWY3DPEHPK3PXP")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    ticket = r.json()["mfa_ticket"]
    r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"mfa_ticket": ticket, "code": TOTP.now()})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def workspace_id(client):
    r = client.get(f"{BASE_URL}/api/workspaces")
    assert r.status_code == 200
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def song_form(client, workspace_id):
    payload = {
        "name": "TEST_PublicFormPage",
        "description": "hosted page test",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "n1", "label": "Name", "key": "naam", "type": "text",
             "required": True, "options": [], "showInList": True},
            {"id": "s1", "label": "Plaat", "key": "plaat", "type": "song_pick",
             "required": True, "options": [], "showInList": True, "mode": "single", "max": 1},
            {"id": "s2", "label": "Top 5", "key": "top5", "type": "song_pick",
             "required": False, "options": [], "showInList": True, "mode": "top5", "max": 5},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}")


def test_public_schema_song_field_self_describing(song_form):
    token = song_form["public_token"]
    r = requests.get(f"{BASE_URL}/api/public/form/{token}")
    assert r.status_code == 200
    body = r.json()
    assert body["submit_url"].endswith(f"/api/public/form/{token}/submit")
    assert body["song_search_url"].endswith("/api/public/itunes/search")
    assert body["honeypot_field"]
    by_key = {f["key"]: f for f in body["fields"]}
    plaat = by_key["plaat"]
    assert plaat["type"] == "song_pick"
    assert plaat["max"] == 1
    assert plaat["mode"] == "single"
    # NEW keys required by this iteration:
    assert plaat["search_url"].endswith("/api/public/itunes/search")
    assert plaat["result_fields"] == ["id", "title", "artist", "artwork", "preview"]
    top5 = by_key["top5"]
    assert top5["max"] == 5 and top5["mode"] == "top5"
    assert top5["search_url"].endswith("/api/public/itunes/search")
    assert top5["result_fields"] == ["id", "title", "artist", "artwork", "preview"]


def test_public_page_html_served_no_auth(song_form):
    """/f/{token} must be served by the frontend without authentication."""
    token = song_form["public_token"]
    r = requests.get(f"{BASE_URL}/f/{token}", allow_redirects=True, timeout=15)
    assert r.status_code == 200, r.text[:300]
    # SPA index html
    assert "<div id=\"root\"" in r.text or "<html" in r.text.lower()


def test_public_submit_missing_song_returns_422(song_form):
    token = song_form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"naam": "Bob", "plaat": [], "top5": []})
    assert r.status_code == 422, r.text


def test_public_submit_song_visible_in_messages(client, song_form):
    """End-to-end: submit via public endpoint, then admin GET returns the song in submissions."""
    token = song_form["public_token"]
    song = {"id": "id-plaat-1", "title": "Yellow", "artist": "Coldplay",
            "artwork": "https://example.com/cover.jpg",
            "preview": "https://example.com/preview.m4a"}
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"naam": "Alice", "plaat": [song], "top5": []})
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]

    r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={song_form['workspace_id']}")
    assert r2.status_code == 200
    subs = {s["id"]: s for s in r2.json()}
    assert sub_id in subs, "submission not found for admin"
    data = subs[sub_id]["data"]
    assert data["naam"] == "Alice"
    plaat = data["plaat"]
    assert isinstance(plaat, list) and len(plaat) == 1
    s0 = plaat[0]
    assert s0["id"] == "id-plaat-1"
    assert s0["title"] == "Yellow"
    assert s0["artist"] == "Coldplay"
    assert s0["artwork"].startswith("http")
    assert s0["preview"].startswith("http")
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


def test_public_submit_regression_scalar_fields(client, workspace_id):
    """Regression: text/email/number/tel/textarea/select/checkbox still work through public submit."""
    payload = {
        "name": "TEST_ScalarRegression",
        "description": "",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "f1", "label": "Name", "key": "name", "type": "text", "required": True, "options": [], "showInList": True},
            {"id": "f2", "label": "Email", "key": "email", "type": "email", "required": False, "options": [], "showInList": True},
            {"id": "f3", "label": "Age", "key": "age", "type": "number", "required": False, "options": [], "showInList": True},
            {"id": "f4", "label": "Phone", "key": "phone", "type": "tel", "required": False, "options": [], "showInList": True},
            {"id": "f5", "label": "Bio", "key": "bio", "type": "textarea", "required": False, "options": [], "showInList": True},
            {"id": "f6", "label": "Color", "key": "color", "type": "select", "required": False, "options": ["Red", "Blue"], "showInList": True},
            {"id": "f7", "label": "Opt-in", "key": "optin", "type": "checkbox", "required": False, "options": [], "showInList": True},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    form = r.json()
    try:
        token = form["public_token"]
        body = {"name": "Sam", "email": "s@x.com", "age": 30, "phone": "+3212345",
                "bio": "hi", "color": "Blue", "optin": True}
        r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit", json=body)
        assert r.status_code == 200, r.text
        sub_id = r.json()["id"]
        r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={workspace_id}")
        subs = {s["id"]: s for s in r2.json()}
        assert sub_id in subs
        d = subs[sub_id]["data"]
        assert d["name"] == "Sam" and d["email"] == "s@x.com" and d["color"] == "Blue" and d["optin"] is True
        client.delete(f"{BASE_URL}/api/submissions/{sub_id}")
    finally:
        client.delete(f"{BASE_URL}/api/forms/{form['id']}")
