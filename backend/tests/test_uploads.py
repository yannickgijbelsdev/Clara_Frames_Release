"""Backend tests for the S3 upload endpoint (POST /api/uploads)."""
import io
import os
import struct
import zlib
import uuid
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _tiny_png(w=2, h=2):
    """Build a valid tiny PNG in-memory."""
    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data +
                struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    raw = b""
    for _ in range(h):
        raw += b"\x00" + (b"\xff\x00\x00" * w)  # filter byte + red pixels
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
    ticket = r.json()["mfa_ticket"]
    code = pyotp.TOTP(ADMIN_TOTP_SECRET).now()
    r2 = s.post(f"{API}/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code}, timeout=15)
    assert r2.status_code == 200
    return s


class TestUploads:
    def test_unauth_upload_rejected(self):
        png = _tiny_png()
        r = requests.post(f"{API}/uploads",
                          files={"file": ("t.png", png, "image/png")}, timeout=20)
        assert r.status_code == 401

    def test_non_image_rejected(self, admin_session):
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("t.txt", b"hello", "text/plain")}, timeout=20)
        assert r.status_code == 400
        assert "image" in r.json().get("detail", "").lower()

    def test_too_large_rejected(self, admin_session):
        # >10 MB payload
        big = b"\x89PNG\r\n\x1a\n" + b"0" * (10 * 1024 * 1024 + 100)
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("big.png", big, "image/png")}, timeout=60)
        assert r.status_code == 400
        assert "large" in r.json().get("detail", "").lower() or "10" in r.json().get("detail", "")

    def test_upload_success_returns_url_and_key(self, admin_session):
        png = _tiny_png()
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("tiny.png", png, "image/png")}, timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "url" in d and "key" in d
        assert "nbg1.your-objectstorage.com" in d["url"]
        assert "koodh-clara" in d["url"]
        assert d["key"].startswith("uploads/")
        assert d["key"].endswith(".png")

        # public GET (no auth) should succeed
        pub = requests.get(d["url"], timeout=30)
        assert pub.status_code == 200, f"public URL not fetchable: {pub.status_code}"
        assert pub.headers.get("content-type", "").startswith("image/")

    def test_upload_jpeg(self, admin_session):
        # smallest valid-ish jpeg signature payload; the endpoint only checks
        # content_type header, not content. Use PNG body but jpg content-type
        # is fine to exercise MIME allow-list.
        png = _tiny_png()
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("t.jpg", png, "image/jpeg")}, timeout=30)
        assert r.status_code == 200
        assert r.json()["key"].endswith(".jpg")
