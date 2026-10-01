"""Backend tests: song_pick normalization on public submit (stringified array, single object, cap)."""
import json
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
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def form(client, workspace_id):
    payload = {
        "name": "TEST_SongNormalize",
        "description": "normalize robustness",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "s1", "label": "Fav", "key": "fav", "type": "song_pick",
             "required": True, "options": [], "showInList": True, "mode": "single", "max": 1},
            {"id": "s2", "label": "Top", "key": "top", "type": "song_pick",
             "required": False, "options": [], "showInList": True, "mode": "top5", "max": 5},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}")


def _get_sub(client, workspace_id, sub_id):
    r = client.get(f"{BASE_URL}/api/submissions?workspace_id={workspace_id}")
    assert r.status_code == 200
    return {s["id"]: s for s in r.json()}[sub_id]


# a) JSON-stringified array -> real array
def test_normalize_stringified_array(client, form, workspace_id):
    token = form["public_token"]
    songs = [{"id": "A", "title": "Alpha", "artist": "X", "artwork": "http://a", "preview": "http://p"}]
    r = requests.post(
        f"{BASE_URL}/api/public/form/{token}/submit",
        json={"fav": json.dumps(songs)},
    )
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    stored = _get_sub(client, workspace_id, sub_id)["data"]["fav"]
    assert isinstance(stored, list) and len(stored) == 1
    assert stored[0]["title"] == "Alpha"
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


# b) Single object (not array) -> wrapped in 1-item array
def test_normalize_single_object(client, form, workspace_id):
    token = form["public_token"]
    song = {"trackId": 42, "trackName": "Yellow", "artistName": "Coldplay",
            "artworkUrl100": "http://art", "previewUrl": "http://prev"}
    r = requests.post(
        f"{BASE_URL}/api/public/form/{token}/submit",
        json={"fav": song},
    )
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    stored = _get_sub(client, workspace_id, sub_id)["data"]["fav"]
    assert isinstance(stored, list) and len(stored) == 1
    # raw iTunes keys retained
    assert stored[0]["trackName"] == "Yellow"
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


# c) Normal array capped to field.max
def test_normalize_array_capped(client, form, workspace_id):
    token = form["public_token"]
    songs = [{"id": f"id{i}", "title": f"T{i}", "artist": "A", "artwork": "", "preview": ""} for i in range(10)]
    r = requests.post(
        f"{BASE_URL}/api/public/form/{token}/submit",
        json={"fav": [songs[0]], "top": songs},
    )
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    data = _get_sub(client, workspace_id, sub_id)["data"]
    assert isinstance(data["top"], list) and len(data["top"]) == 5
    assert [s["id"] for s in data["top"]] == [f"id{i}" for i in range(5)]
    assert isinstance(data["fav"], list) and len(data["fav"]) == 1
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


# Required empty still 422
def test_required_empty_returns_422(form):
    token = form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit", json={"fav": []})
    assert r.status_code == 422
