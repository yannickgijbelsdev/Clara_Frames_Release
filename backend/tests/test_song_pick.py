"""Backend tests for song_pick field type (iTunes proxy, schema exposure, submission caps)."""
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
        "name": "TEST_SongPickForm",
        "description": "song pick backend test",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "s1", "label": "Fav song", "key": "fav", "type": "song_pick",
             "required": True, "options": [], "showInList": True, "mode": "single", "max": 1},
            {"id": "s2", "label": "Top 5", "key": "top5", "type": "song_pick",
             "required": False, "options": [], "showInList": True, "mode": "top5", "max": 5},
            {"id": "n1", "label": "Name", "key": "name", "type": "text",
             "required": False, "options": [], "showInList": True},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}")


# ---------- iTunes proxy ----------
def test_itunes_search_returns_songs():
    r = requests.get(f"{BASE_URL}/api/public/itunes/search", params={"term": "coldplay", "limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body, list)
    assert 1 <= len(body) <= 5
    s = body[0]
    for k in ("id", "title", "artist", "artwork", "preview"):
        assert k in s, f"missing key {k}"
    assert s["preview"].startswith("http")
    assert s["artwork"].startswith("http")
    # 200x200 upgraded
    assert "200x200" in s["artwork"] or s["artwork"] == ""


def test_itunes_search_empty_term_returns_empty_list():
    r = requests.get(f"{BASE_URL}/api/public/itunes/search", params={"term": ""})
    assert r.status_code == 200
    assert r.json() == []


def test_itunes_search_cors_open():
    r = requests.get(f"{BASE_URL}/api/public/itunes/search",
                     params={"term": "adele", "limit": 2},
                     headers={"Origin": "https://any-external-site.example"})
    assert r.status_code == 200
    aco = r.headers.get("access-control-allow-origin", "")
    assert aco in ("*", "https://any-external-site.example"), f"CORS header missing: {r.headers}"


# ---------- Public schema exposes song fields ----------
def test_public_schema_exposes_song_fields(song_form):
    token = song_form["public_token"]
    r = requests.get(f"{BASE_URL}/api/public/form/{token}")
    assert r.status_code == 200
    body = r.json()
    assert "submit_url" in body and body["submit_url"].endswith(f"/api/public/form/{token}/submit")
    assert "song_search_url" in body and body["song_search_url"].endswith("/api/public/itunes/search")
    assert "honeypot_field" in body and body["honeypot_field"]
    by_key = {f["key"]: f for f in body["fields"]}
    assert by_key["fav"]["type"] == "song_pick"
    assert by_key["fav"]["max"] == 1
    assert by_key["fav"]["mode"] == "single"
    assert by_key["top5"]["max"] == 5
    assert by_key["top5"]["mode"] == "top5"


# ---------- Submission behaviour ----------
def _song(i):
    return {"id": f"id{i}", "title": f"Song {i}", "artist": "A", "artwork": "http://x", "preview": "http://p"}


def test_submit_caps_top5_to_five_in_order(client, song_form):
    token = song_form["public_token"]
    songs6 = [_song(i) for i in range(1, 7)]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"fav": [_song(0)], "top5": songs6})
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    # verify persisted with cap + order via authenticated GET
    r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={song_form['workspace_id']}")
    assert r2.status_code == 200
    subs = {s["id"]: s for s in r2.json()}
    assert sub_id in subs
    stored = subs[sub_id]["data"]["top5"]
    assert len(stored) == 5
    assert [s["id"] for s in stored] == [f"id{i}" for i in range(1, 6)]
    # cleanup
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


def test_submit_required_song_empty_returns_422(song_form):
    token = song_form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"fav": [], "top5": [], "name": "x"})
    assert r.status_code == 422
    assert "fav" in r.text.lower() or "song" in r.text.lower()


def test_submit_valid_single_song(client, song_form):
    token = song_form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"fav": [_song(99)], "name": "Tester"})
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={song_form['workspace_id']}")
    subs = {s["id"]: s for s in r2.json()}
    assert sub_id in subs
    fav = subs[sub_id]["data"]["fav"]
    assert isinstance(fav, list) and len(fav) == 1 and fav[0]["id"] == "id99"
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")
