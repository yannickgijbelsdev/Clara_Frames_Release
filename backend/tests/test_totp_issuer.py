"""Tests for TOTP issuer being 'Clara Frames' (bug fix regression)."""
import os
import re
import uuid
from urllib.parse import urlparse, parse_qs, unquote

import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_ISSUER = "Clara Frames"
FORBIDDEN_ISSUER = "vMix Overlay Studio"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_SECRET = "JBSWY3DPEHPK3PXP"

YANNICK_EMAIL = "yannick.gijbels@koodh.com"
YANNICK_PASSWORD = "KYLovie13monx"


def _assert_issuer(otpauth_url: str):
    assert otpauth_url.startswith("otpauth://totp/"), f"Bad URI: {otpauth_url}"
    assert FORBIDDEN_ISSUER not in otpauth_url, f"Forbidden issuer present: {otpauth_url}"
    parsed = urlparse(otpauth_url)
    # Label is path (URL-encoded). Strip leading '/'.
    label = unquote(parsed.path.lstrip("/"))
    assert label.startswith(f"{EXPECTED_ISSUER}:"), f"Label prefix wrong: {label!r}"
    qs = parse_qs(parsed.query)
    assert qs.get("issuer") == [EXPECTED_ISSUER], f"issuer query wrong: {qs.get('issuer')}"


# ---- (a) Register flow ----
def test_register_returns_clara_frames_issuer():
    email = f"test_totp_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "TestPass123!"})
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    assert "otpauth_url" in data, f"missing otpauth_url: {data}"
    assert "qr" in data
    _assert_issuer(data["otpauth_url"])


# ---- (b) Login setup path (yannick - not yet MFA-set) ----
def test_login_setup_returns_clara_frames_issuer():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": YANNICK_EMAIL, "password": YANNICK_PASSWORD},
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("mfa_setup_required") is True, f"expected mfa_setup_required: {data}"
    assert "otpauth_url" in data
    _assert_issuer(data["otpauth_url"])


# ---- Regression: admin full MFA login flow works ----
def test_admin_login_and_mfa_verify_regression():
    session = requests.Session()
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    # Admin has MFA enabled -> should not include setup
    assert not data.get("mfa_setup_required"), f"admin should not require setup: {data}"

    ticket = data.get("mfa_ticket")
    assert ticket, f"missing mfa_ticket: {data}"
    code = pyotp.TOTP(ADMIN_SECRET).now()
    r2 = session.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code})
    assert r2.status_code == 200, f"mfa/verify failed: {r2.status_code} {r2.text}"
    # httpOnly cookie should now be set
    assert any(c.name for c in session.cookies), f"no cookies set: {session.cookies}"


# ---- (c) 2FA reset returns Clara Frames issuer (authenticated admin) ----
def test_2fa_reset_returns_clara_frames_issuer():
    session = requests.Session()
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    ticket = r.json().get("mfa_ticket")
    assert ticket
    code = pyotp.TOTP(ADMIN_SECRET).now()
    r2 = session.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code})
    assert r2.status_code == 200, f"mfa verify failed: {r2.text}"

    r3 = session.post(f"{API}/auth/2fa/reset")
    assert r3.status_code == 200, f"2fa/reset failed: {r3.status_code} {r3.text}"
    data = r3.json()
    assert "otpauth_url" in data, f"missing otpauth_url: {data}"
    _assert_issuer(data["otpauth_url"])

    # Restore admin's original TOTP secret so future tests still work with JBSWY3DPEHPK3PXP.
    # The reset endpoint replaced the secret; put the known one back via DB.
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def restore():
        c = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = c[os.environ["DB_NAME"]]
        await db.users.update_one(
            {"email": ADMIN_EMAIL},
            {"$set": {"totp_secret": ADMIN_SECRET, "mfa_enabled": True}},
        )
        c.close()

    asyncio.get_event_loop().run_until_complete(restore()) if False else asyncio.run(restore())
