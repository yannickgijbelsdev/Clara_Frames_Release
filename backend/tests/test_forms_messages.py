"""Backend tests for Forms + Messages (public integration + inbox)."""
import os
import time
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

TOTP = pyotp.TOTP("JBSWY3DPEHPK3PXP")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    # login
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("mfa_required")
    ticket = data["mfa_ticket"]
    r = s.post(f"{BASE_URL}/api/auth/mfa/verify", json={"mfa_ticket": ticket, "code": TOTP.now()})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def workspace_id(client):
    r = client.get(f"{BASE_URL}/api/workspaces")
    assert r.status_code == 200
    return r.json()[0]["id"]


@pytest.fixture(scope="module")
def form(client, workspace_id):
    payload = {
        "name": "TEST_ContactForm",
        "description": "test",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "f1", "label": "Name", "key": "name", "type": "text", "required": True, "options": [], "showInList": True},
            {"id": "f2", "label": "Email", "key": "email", "type": "email", "required": True, "options": [], "showInList": True},
            {"id": "f3", "label": "Message", "key": "message", "type": "textarea", "required": False, "options": [], "showInList": False},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}")


def test_forms_list(client, workspace_id, form):
    r = client.get(f"{BASE_URL}/api/forms?workspace_id={workspace_id}")
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert form["id"] in ids


def test_form_get(client, form):
    r = client.get(f"{BASE_URL}/api/forms/{form['id']}")
    assert r.status_code == 200
    d = r.json()
    assert d["name"] == "TEST_ContactForm"
    assert len(d["fields"]) == 3
    assert d.get("public_token")


def test_form_update_persist(client, form):
    upd = {"name": "TEST_ContactForm2", "description": "d2", "fields": form["fields"]}
    r = client.put(f"{BASE_URL}/api/forms/{form['id']}", json=upd)
    assert r.status_code == 200
    r = client.get(f"{BASE_URL}/api/forms/{form['id']}")
    assert r.json()["name"] == "TEST_ContactForm2"


def test_public_schema_get(form):
    url = f"{BASE_URL}/api/public/form/{form['public_token']}"
    r = requests.get(url)
    assert r.status_code == 200
    d = r.json()
    assert "fields" in d
    assert len(d["fields"]) == 3
    # CORS
    assert r.headers.get("access-control-allow-origin") == "*"


def test_public_submit_missing_required(form):
    url = f"{BASE_URL}/api/public/form/{form['public_token']}/submit"
    r = requests.post(url, json={"message": "hi"})
    assert r.status_code == 422, r.text


def test_public_submit_valid_and_appears_in_messages(client, workspace_id, form):
    url = f"{BASE_URL}/api/public/form/{form['public_token']}/submit"
    r = requests.post(url, json={"name": "Bob", "email": "bob@x.com", "message": "hello"})
    assert r.status_code == 200, r.text
    assert r.headers.get("access-control-allow-origin") == "*"
    time.sleep(0.3)
    # unread count
    r = client.get(f"{BASE_URL}/api/submissions/unread-count?workspace_id={workspace_id}")
    assert r.status_code == 200
    assert r.json()["count"] >= 1
    # list
    r = client.get(f"{BASE_URL}/api/submissions?workspace_id={workspace_id}")
    assert r.status_code == 200
    subs = r.json()
    mine = [s for s in subs if s["form_id"] == form["id"]]
    assert mine
    s0 = mine[0]
    assert s0["data"]["name"] == "Bob"
    assert s0["read"] is False
    # mark read
    rr = client.post(f"{BASE_URL}/api/submissions/{s0['id']}/read")
    assert rr.status_code in (200, 204)
    r = client.get(f"{BASE_URL}/api/submissions/unread-count?workspace_id={workspace_id}")
    prev_unread = r.json()["count"]
    # delete submission
    rr = client.delete(f"{BASE_URL}/api/submissions/{s0['id']}")
    assert rr.status_code in (200, 204)


def test_options_preflight_cors(form):
    url = f"{BASE_URL}/api/public/form/{form['public_token']}/submit"
    r = requests.options(url, headers={
        "Origin": "https://example.com",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert r.status_code in (200, 204)
    assert r.headers.get("access-control-allow-origin") == "*"


def test_no_register_link_not_related_here():
    # placeholder - UI check done in playwright
    assert True
