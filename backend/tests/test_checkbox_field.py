"""Backend tests for checkbox field end-to-end (public submit -> admin GET)."""
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
def checkbox_form(client, workspace_id):
    payload = {
        "name": "TEST_CheckboxField",
        "description": "checkbox bug fix test",
        "workspace_id": workspace_id,
        "fields": [
            {"id": "n1", "label": "Naam", "key": "naam", "type": "text",
             "required": True, "options": [], "showInList": True},
            {"id": "c1", "label": "Ik wil opgebeld worden", "key": "opgebeld",
             "type": "checkbox", "required": False, "options": [], "showInList": True},
        ],
    }
    r = client.post(f"{BASE_URL}/api/forms", json=payload)
    assert r.status_code in (200, 201), r.text
    f = r.json()
    yield f
    client.delete(f"{BASE_URL}/api/forms/{f['id']}")


def test_public_schema_exposes_checkbox(checkbox_form):
    token = checkbox_form["public_token"]
    r = requests.get(f"{BASE_URL}/api/public/form/{token}")
    assert r.status_code == 200
    by_key = {f["key"]: f for f in r.json()["fields"]}
    assert by_key["opgebeld"]["type"] == "checkbox"
    assert by_key["opgebeld"]["label"] == "Ik wil opgebeld worden"


def test_submit_checked_true_persists_truthy(client, checkbox_form):
    token = checkbox_form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"naam": "Alice", "opgebeld": True})
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={checkbox_form['workspace_id']}")
    assert r2.status_code == 200
    sub = next(s for s in r2.json() if s["id"] == sub_id)
    val = sub["data"]["opgebeld"]
    # truthy per Messages renderValue mapping
    assert val in (True, "true", "on", 1), f"expected truthy, got {val!r}"
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


def test_submit_unchecked_false_persists_falsy(client, checkbox_form):
    token = checkbox_form["public_token"]
    r = requests.post(f"{BASE_URL}/api/public/form/{token}/submit",
                      json={"naam": "Bob", "opgebeld": False})
    assert r.status_code == 200, r.text
    sub_id = r.json()["id"]
    r2 = client.get(f"{BASE_URL}/api/submissions?workspace_id={checkbox_form['workspace_id']}")
    sub = next(s for s in r2.json() if s["id"] == sub_id)
    val = sub["data"].get("opgebeld")
    assert val not in (True, "true", "on", 1), f"expected falsy, got {val!r}"
    client.delete(f"{BASE_URL}/api/submissions/{sub_id}")


def test_honeypot_present_in_schema(checkbox_form):
    token = checkbox_form["public_token"]
    r = requests.get(f"{BASE_URL}/api/public/form/{token}")
    assert r.status_code == 200
    assert r.json().get("honeypot_field")
