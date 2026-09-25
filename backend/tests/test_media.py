"""Backend tests for the Media Library endpoints (GET/DELETE /api/media, POST /api/uploads persistence)."""
import os
import struct
import zlib
import pyotp
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"
ADMIN_TOTP_SECRET = "JBSWY3DPEHPK3PXP"


def _tiny_png(w=2, h=2):
    def chunk(kind, data):
        return (struct.pack(">I", len(data)) + kind + data +
                struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(h):
        raw += b"\x00" + (b"\xff\x00\x00" * w)
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


class TestMediaLibrary:
    def test_unauth_list_rejected(self):
        r = requests.get(f"{API}/media", timeout=15)
        assert r.status_code == 401

    def test_unauth_delete_rejected(self):
        r = requests.delete(f"{API}/media/some-fake-id", timeout=15)
        assert r.status_code == 401

    def test_upload_appears_in_media_then_delete_removes(self, admin_session):
        # Upload
        png = _tiny_png()
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("tinytest.png", png, "image/png")}, timeout=60)
        assert r.status_code == 200, r.text
        up = r.json()
        assert "id" in up and "url" in up and "key" in up
        media_id = up["id"]

        # List
        r2 = admin_session.get(f"{API}/media", timeout=15)
        assert r2.status_code == 200
        items = r2.json()
        assert isinstance(items, list)
        match = [m for m in items if m["id"] == media_id]
        assert len(match) == 1, f"uploaded id {media_id} not found in media list"
        m = match[0]
        # Field structure
        for f in ("id", "url", "key", "name", "content_type", "size", "is_video", "created_at"):
            assert f in m, f"missing field {f}"
        assert m["is_video"] is False
        assert m["content_type"] == "image/png"
        assert m["name"] == "tinytest.png"
        assert m["size"] == len(png)
        # No mongo _id leaked
        assert "_id" not in m

        # newest-first: our upload should be at index 0
        assert items[0]["id"] == media_id

        # public URL fetchable
        pub = requests.get(m["url"], timeout=30)
        assert pub.status_code == 200

        # Delete
        r3 = admin_session.delete(f"{API}/media/{media_id}", timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True

        # Confirm gone
        r4 = admin_session.get(f"{API}/media", timeout=15)
        assert r4.status_code == 200
        assert not any(x["id"] == media_id for x in r4.json())

        # Second delete -> 404
        r5 = admin_session.delete(f"{API}/media/{media_id}", timeout=15)
        assert r5.status_code == 404

    def test_delete_nonexistent_returns_404(self, admin_session):
        r = admin_session.delete(f"{API}/media/does-not-exist-xyz", timeout=15)
        assert r.status_code == 404

    def test_video_upload_flagged_is_video(self, admin_session):
        # Use tiny bytes with video/mp4 content-type; endpoint validates by header
        r = admin_session.post(f"{API}/uploads",
                               files={"file": ("tiny.mp4", b"\x00\x00\x00\x18ftypmp42" + b"0" * 128, "video/mp4")},
                               timeout=60)
        assert r.status_code == 200, r.text
        mid = r.json()["id"]
        try:
            lst = admin_session.get(f"{API}/media", timeout=15).json()
            hit = [m for m in lst if m["id"] == mid]
            assert hit and hit[0]["is_video"] is True
        finally:
            admin_session.delete(f"{API}/media/{mid}", timeout=30)
