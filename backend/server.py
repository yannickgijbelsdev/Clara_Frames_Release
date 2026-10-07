from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import io
import re
import uuid
import base64
import secrets
import asyncio
import logging
from zoneinfo import ZoneInfo
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

import jwt
import bcrypt
import pyotp
import qrcode
import requests
import boto3
from botocore.config import Config
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------------------------------------------------------------------
# Config / DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
ISSUER = "Clara Frames"

# S3 / object storage (Hetzner, public-read)
S3_ENDPOINT = os.environ.get("S3_ENDPOINT", "")
S3_BUCKET = os.environ.get("S3_BUCKET", "")
S3_REGION = os.environ.get("S3_REGION", "eu-central")
_s3_client = None

def get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            region_name=S3_REGION,
            aws_access_key_id=os.environ.get("S3_ACCESS_KEY"),
            aws_secret_access_key=os.environ.get("S3_SECRET_KEY"),
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
    return _s3_client

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("overlay")

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "type": "access",
               "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "type": "refresh",
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_mfa_ticket(user_id: str) -> str:
    payload = {"sub": user_id, "type": "mfa",
               "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def set_auth_cookies(response: Response, user_id: str, email: str):
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    response.set_cookie("access_token", access, httponly=True, secure=True,
                        samesite="none", max_age=43200, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True,
                        samesite="none", max_age=604800, path="/")

def make_qr_data_url(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

def gen_backup_codes(n: int = 8):
    codes = ["-".join([secrets.token_hex(2), secrets.token_hex(2)]) for _ in range(n)]
    hashes = [hash_password(c) for c in codes]
    return codes, hashes

def check_backup(code: str, hashes: list):
    for h in hashes:
        if verify_password(code, h):
            return h
    return None

_WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def format_clock_py(tz: str, fmt: str) -> str:
    try:
        now = datetime.now(ZoneInfo(tz or "UTC"))
    except Exception:
        now = datetime.now(timezone.utc)
    f = fmt or "HH:mm:ss"
    return (f.replace("dddd", _WEEKDAYS[now.weekday()])
             .replace("YYYY", f"{now.year}")
             .replace("MMMM", _MONTHS[now.month - 1])
             .replace("MM", f"{now.month:02d}")
             .replace("DD", f"{now.day:02d}")
             .replace("HH", f"{now.hour:02d}")
             .replace("mm", f"{now.minute:02d}")
             .replace("ss", f"{now.second:02d}"))

def _hhmm(v):
    try:
        h, m = v.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["id"] = str(user["_id"])
        user.pop("_id", None)
        user.pop("password_hash", None)
        user.pop("totp_secret", None)
        user.pop("totp_secret_pending", None)
        user["backup_codes_count"] = len(user.get("backup_codes", []))
        user.pop("backup_codes", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str
    name: str = "User"

class LoginInput(BaseModel):
    email: EmailStr
    password: str

class MfaVerifyInput(BaseModel):
    mfa_ticket: str
    code: str

class SetupVerifyInput(BaseModel):
    email: EmailStr
    password: str
    code: str

class SourceField(BaseModel):
    key: str
    label: str = ""
    path: str = ""

class SourceInput(BaseModel):
    name: str
    type: str = "custom"  # custom | builtin_weather | builtin_time
    url: str = ""
    method: str = "GET"
    headers: Dict[str, str] = {}
    refresh_interval: int = 30
    fields: List[SourceField] = []
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    timezone: Optional[str] = None
    song_path: Optional[str] = None
    separator: Optional[str] = None
    artwork: Optional[bool] = None
    reverse: Optional[bool] = None
    format: Optional[str] = None  # custom API: text | json | image
    image_path: Optional[str] = None
    workspace_id: Optional[str] = None

class LiveSongInput(BaseModel):
    workspace_id: str
    title: str = ""
    artist: str = ""
    artwork: str = ""
    preview: str = ""

class SceneInput(BaseModel):
    name: str
    width: int = 1920
    height: int = 1080
    background: Dict[str, Any] = {"color": "#0b1020"}
    elements: List[Dict[str, Any]] = []
    flows: List[Dict[str, Any]] = []
    workspace_id: Optional[str] = None

class PancarteInput(BaseModel):
    name: str
    width: int = 1920
    height: int = 1080
    background: Dict[str, Any] = {"color": "#0b1020"}
    elements: List[Dict[str, Any]] = []
    workspace_id: Optional[str] = None

class FlowInput(BaseModel):
    name: str
    interval: int = 5
    entrance: str = "fade"
    entranceDuration: float = 0.6
    pancarte_ids: List[str] = []
    workspace_id: Optional[str] = None

class FormInput(BaseModel):
    name: str
    description: str = ""
    fields: List[Dict[str, Any]] = []
    workspace_id: Optional[str] = None

class ChangePassword(BaseModel):
    current_password: str
    new_password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    avatar: Optional[str] = None

class TwoFAConfirm(BaseModel):
    code: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = "User"
    role: str = "user"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None

class WorkspaceInput(BaseModel):
    name: str
    color: str = "#5f6da6"

# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(body: RegisterInput):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    secret = pyotp.random_base32()
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": "user",
        "totp_secret": secret,
        "mfa_enabled": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    uri = pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)
    return {"email": email, "otpauth_url": uri, "secret": secret, "qr": make_qr_data_url(uri)}

@api_router.post("/auth/mfa/setup-verify")
async def setup_verify(body: SetupVerifyInput, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not pyotp.TOTP(user["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"mfa_enabled": True}})
    set_auth_cookies(response, str(user["_id"]), email)
    return {"id": str(user["_id"]), "email": email, "name": user.get("name"), "role": user.get("role")}

@api_router.post("/auth/login")
async def login(body: LoginInput):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("mfa_enabled"):
        # Force MFA setup before granting access
        uri = pyotp.TOTP(user["totp_secret"]).provisioning_uri(name=email, issuer_name=ISSUER)
        return {"mfa_setup_required": True, "email": email,
                "otpauth_url": uri, "secret": user["totp_secret"], "qr": make_qr_data_url(uri)}
    return {"mfa_required": True, "mfa_ticket": create_mfa_ticket(str(user["_id"]))}

@api_router.post("/auth/mfa/verify")
async def mfa_verify(body: MfaVerifyInput, response: Response):
    try:
        payload = jwt.decode(body.mfa_ticket, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "mfa":
            raise HTTPException(status_code=401, detail="Invalid ticket")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="MFA session expired, please log in again")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    code = body.code.strip()
    ok = pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1)
    if not ok:
        h = check_backup(code, user.get("backup_codes", []))
        if h:
            await db.users.update_one({"_id": user["_id"]}, {"$pull": {"backup_codes": h}})
            ok = True
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    set_auth_cookies(response, str(user["_id"]), user["email"])
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name"), "role": user.get("role")}

# ---- Account management ----
@api_router.post("/auth/change-password")
async def change_password(body: ChangePassword, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api_router.put("/auth/profile")
async def update_profile(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    upd = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.avatar is not None:
        upd["avatar"] = body.avatar
    if upd:
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": upd})
    return {**user, **upd}

@api_router.post("/auth/2fa/reset")
async def reset_2fa(user: dict = Depends(get_current_user)):
    secret = pyotp.random_base32()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"totp_secret_pending": secret}})
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name=ISSUER)
    return {"otpauth_url": uri, "secret": secret, "qr": make_qr_data_url(uri)}

@api_router.post("/auth/2fa/confirm")
async def confirm_2fa(body: TwoFAConfirm, user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    pending = doc.get("totp_secret_pending")
    if not pending:
        raise HTTPException(status_code=400, detail="Start a 2FA reset first")
    if not pyotp.TOTP(pending).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    codes, hashes = gen_backup_codes()
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {
        "totp_secret": pending, "mfa_enabled": True, "backup_codes": hashes},
        "$unset": {"totp_secret_pending": ""}})
    return {"ok": True, "backup_codes": codes}

@api_router.post("/auth/2fa/backup-codes")
async def regen_backup_codes(user: dict = Depends(get_current_user)):
    codes, hashes = gen_backup_codes()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"backup_codes": hashes}})
    return {"backup_codes": codes}

# ---- User management (admin) ----
@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find({}).to_list(500)
    return [{"id": str(d["_id"]), "email": d["email"], "name": d.get("name"),
             "role": d.get("role", "user"), "mfa_enabled": d.get("mfa_enabled", False),
             "created_at": d.get("created_at")} for d in docs]

@api_router.post("/users")
async def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name,
           "role": body.role, "totp_secret": pyotp.random_base32(), "mfa_enabled": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    res = await db.users.insert_one(doc)
    return {"id": str(res.inserted_id), "email": email, "name": body.name, "role": body.role, "mfa_enabled": False}

@api_router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    if body.role and body.role != "admin":
        target = await db.users.find_one({"_id": ObjectId(user_id)})
        if target and target.get("role") == "admin":
            admin_count = await db.users.count_documents({"role": "admin"})
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="You cannot demote the last admin")
    upd = {k: v for k, v in {"name": body.name, "role": body.role}.items() if v is not None}
    if upd:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": upd})
    return {"ok": True}

@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if target and target.get("role") == "admin":
        admin_count = await db.users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="You cannot delete the last admin")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"ok": True}

# ---- Workspaces / environments ----
async def ensure_default_workspace(user_id: str) -> str:
    ws = await db.workspaces.find_one({"user_id": user_id})
    if not ws:
        doc = {"id": str(uuid.uuid4()), "user_id": user_id, "name": "My Project",
               "color": "#5f6da6", "created_at": datetime.now(timezone.utc).isoformat()}
        await db.workspaces.insert_one(doc)
        return doc["id"]
    return ws["id"]

@api_router.get("/workspaces")
async def list_workspaces(user: dict = Depends(get_current_user)):
    await ensure_default_workspace(user["id"])
    docs = await db.workspaces.find({"user_id": user["id"]}, {"_id": 0}).to_list(200)
    return docs

@api_router.post("/workspaces")
async def create_workspace(body: WorkspaceInput, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "name": body.name,
           "color": body.color, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.workspaces.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/workspaces/{ws_id}")
async def update_workspace(ws_id: str, body: WorkspaceInput, user: dict = Depends(get_current_user)):
    await db.workspaces.update_one({"id": ws_id, "user_id": user["id"]}, {"$set": {"name": body.name, "color": body.color}})
    return {"ok": True}

@api_router.delete("/workspaces/{ws_id}")
async def delete_workspace(ws_id: str, user: dict = Depends(get_current_user)):
    existing = await db.workspaces.find_one({"id": ws_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Environment not found")
    count = await db.workspaces.count_documents({"user_id": user["id"]})
    if count <= 1:
        raise HTTPException(status_code=400, detail="You need at least one environment")
    await db.workspaces.delete_one({"id": ws_id, "user_id": user["id"]})
    await db.scenes.delete_many({"user_id": user["id"], "workspace_id": ws_id})
    await db.sources.delete_many({"user_id": user["id"], "workspace_id": ws_id})
    return {"ok": True}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------------------------------------------------------------------
# Uploads (S3 object storage)
# ---------------------------------------------------------------------------
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/ogg"}
ALLOWED_UPLOAD_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES

@api_router.post("/uploads")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if file.content_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=400, detail="Only image or video files are allowed")
    data = await file.read()
    is_video = file.content_type in ALLOWED_VIDEO_TYPES
    limit = 50 * 1024 * 1024 if is_video else 10 * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(status_code=400, detail=f"File too large (max {50 if is_video else 10} MB)")
    ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin")
    ext = re.sub(r"[^a-z0-9]", "", ext)[:5] or "bin"
    key = f"uploads/{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await asyncio.to_thread(
            get_s3().put_object,
            Bucket=S3_BUCKET, Key=key, Body=data,
            ContentType=file.content_type, ACL="public-read",
        )
    except Exception as e:
        logger.error(f"S3 upload failed: {e}")
        raise HTTPException(status_code=502, detail="Upload to storage failed")
    url = f"{S3_ENDPOINT.rstrip('/')}/{S3_BUCKET}/{key}"
    media = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "key": key, "url": url,
        "content_type": file.content_type, "size": len(data),
        "name": file.filename or key.split("/")[-1], "is_video": is_video,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.media.insert_one(media)
    return {"url": url, "key": key, "id": media["id"]}

@api_router.get("/media")
async def list_media(user: dict = Depends(get_current_user)):
    docs = await db.media.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api_router.delete("/media/{media_id}")
async def delete_media(media_id: str, user: dict = Depends(get_current_user)):
    doc = await db.media.find_one({"id": media_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Media not found")
    try:
        await asyncio.to_thread(get_s3().delete_object, Bucket=S3_BUCKET, Key=doc["key"])
    except Exception as e:
        logger.error(f"S3 delete failed: {e}")
    await db.media.delete_one({"id": media_id})
    return {"ok": True}

# ---------------------------------------------------------------------------
# Overlays (uploadable HTML / video / image overlays, usable in scenes & pancartes)
# ---------------------------------------------------------------------------
ALLOWED_OVERLAY_HTML = {"text/html", "application/xhtml+xml"}
ALLOWED_OVERLAY_TYPES = ALLOWED_OVERLAY_HTML | ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES

def _overlay_kind(content_type: str, filename: str) -> str:
    name = (filename or "").lower()
    if content_type in ALLOWED_OVERLAY_HTML or name.endswith((".html", ".htm")):
        return "html"
    if content_type in ALLOWED_VIDEO_TYPES or name.endswith((".mp4", ".webm", ".mov", ".ogg")):
        return "video"
    return "image"

@api_router.post("/overlays/upload")
async def upload_overlay(file: UploadFile = File(...), workspace_id: str = Form(...), user: dict = Depends(get_current_user)):
    name = (file.filename or "").lower()
    is_html = file.content_type in ALLOWED_OVERLAY_HTML or name.endswith((".html", ".htm"))
    if file.content_type not in ALLOWED_OVERLAY_TYPES and not is_html:
        raise HTTPException(status_code=400, detail="Only HTML, video or image files are allowed")
    data = await file.read()
    is_video = file.content_type in ALLOWED_VIDEO_TYPES
    limit = 50 * 1024 * 1024 if is_video else (5 * 1024 * 1024 if is_html else 10 * 1024 * 1024)
    if len(data) > limit:
        mb = 50 if is_video else (5 if is_html else 10)
        raise HTTPException(status_code=400, detail=f"File too large (max {mb} MB)")
    ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin")
    ext = re.sub(r"[^a-z0-9]", "", ext)[:5] or "bin"
    content_type = "text/html; charset=utf-8" if is_html else file.content_type
    key = f"overlays/{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await asyncio.to_thread(
            get_s3().put_object,
            Bucket=S3_BUCKET, Key=key, Body=data,
            ContentType=content_type, ACL="public-read",
        )
    except Exception as e:
        logger.error(f"S3 overlay upload failed: {e}")
        raise HTTPException(status_code=502, detail="Upload to storage failed")
    url = f"{S3_ENDPOINT.rstrip('/')}/{S3_BUCKET}/{key}"
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "workspace_id": workspace_id,
        "key": key, "url": url, "name": file.filename or key.split("/")[-1],
        "kind": _overlay_kind(file.content_type, file.filename), "content_type": content_type,
        "size": len(data), "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.overlays.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/overlays")
async def list_overlays(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.overlays.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs

@api_router.delete("/overlays/{overlay_id}")
async def delete_overlay(overlay_id: str, user: dict = Depends(get_current_user)):
    doc = await db.overlays.find_one({"id": overlay_id, "user_id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Overlay not found")
    try:
        await asyncio.to_thread(get_s3().delete_object, Bucket=S3_BUCKET, Key=doc["key"])
    except Exception as e:
        logger.error(f"S3 overlay delete failed: {e}")
    await db.overlays.delete_one({"id": overlay_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# API Sources
# ---------------------------------------------------------------------------
def _resolve_path(data: Any, path: str) -> Any:
    if not path:
        return data
    tokens = re.findall(r'[^.\[\]]+', path)
    cur = data
    for t in tokens:
        try:
            if isinstance(cur, list):
                cur = cur[int(t)]
            elif isinstance(cur, dict):
                cur = cur.get(t)
            else:
                return None
        except (ValueError, IndexError, KeyError):
            return None
        if cur is None:
            return None
    return cur

def _fetch_source_sync(url: str, method: str, headers: dict) -> Any:
    r = requests.request(method or "GET", url, headers=headers or {}, timeout=8)
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        return {"_text": r.text}

async def _itunes_artwork(term: str) -> str:
    term = (term or "").strip()
    if not term:
        return ""
    try:
        r = await asyncio.to_thread(requests.get, "https://itunes.apple.com/search",
                                    params={"term": term, "media": "music", "entity": "song", "limit": 1}, timeout=8)
        results = r.json().get("results", [])
    except Exception:
        return ""
    if not results:
        return ""
    art = results[0].get("artworkUrl100") or results[0].get("artworkUrl60") or ""
    return art.replace("100x100bb", "600x600bb") if art else ""

def _split_now_playing(song: str, sep: str, reverse: bool):
    song = (song or "").strip()
    sep = sep or " - "
    artist, title = "", ""
    if sep and sep in song:
        a, b = song.split(sep, 1)
        if reverse:
            title, artist = a.strip(), b.strip()
        else:
            artist, title = a.strip(), b.strip()
    else:
        title = song
    return artist, title

async def resolve_source_values(source: dict) -> Dict[str, Any]:
    """Fetch (respecting cache) and resolve configured field values."""
    if source.get("type") == "builtin_time":
        tz = source.get("timezone") or "UTC"
        return {"_tz": tz}
    if source.get("type") == "builtin_live":
        live = source.get("live") or {}
        return {"title": live.get("title", ""), "artist": live.get("artist", ""),
                "text": live.get("text", ""), "artwork": live.get("artwork", "")}
    now = datetime.now(timezone.utc)
    interval = int(source.get("refresh_interval", 30))
    last = source.get("last_fetched")
    raw = source.get("last_raw")
    stale = True
    if last:
        try:
            stale = (now - datetime.fromisoformat(last)).total_seconds() > interval
        except Exception:
            stale = True
    if stale or raw is None:
        try:
            raw = await asyncio.to_thread(_fetch_source_sync, source["url"], source.get("method", "GET"), source.get("headers", {}))
            await db.sources.update_one({"id": source["id"]}, {"$set": {
                "last_raw": raw, "last_fetched": now.isoformat(), "last_error": None}})
        except Exception as e:
            await db.sources.update_one({"id": source["id"]}, {"$set": {"last_error": str(e)}})
            raw = source.get("last_raw")
    if source.get("type") == "builtin_nowplaying":
        song = ""
        if isinstance(raw, dict):
            if set(raw.keys()) == {"_text"}:
                song = (raw.get("_text") or "").strip()
            else:
                sp = source.get("song_path") or ""
                val = _resolve_path(raw, sp) if sp else None
                if not val:
                    for k in ("song_title", "raw_song_title", "original_song_title", "title", "np", "nowplaying", "song"):
                        if raw.get(k):
                            val = raw.get(k); break
                song = (str(val) if val else "").strip()
        else:
            song = str(raw or "").strip()
        artist, title = _split_now_playing(song, source.get("separator") or " - ", bool(source.get("reverse")))
        artwork = ""
        if source.get("artwork", True) and song:
            cache = source.get("np_cache") or {}
            if cache.get("song") == song and cache.get("artwork") is not None:
                artwork = cache.get("artwork") or ""
            else:
                artwork = await _itunes_artwork(((artist + " " + title).strip()) or song)
                await db.sources.update_one({"id": source["id"]}, {"$set": {"np_cache": {"song": song, "artwork": artwork}}})
        return {"song": song, "artist": artist, "title": title, "artwork": artwork}
    values = {}
    for f in source.get("fields", []):
        if not (f.get("key") or "").strip():
            continue
        values[f["key"]] = _resolve_path(raw, f.get("path", ""))
    # Plain-text (non-JSON) APIs are wrapped as {"_text": ...}; always expose as "text"
    if isinstance(raw, dict) and set(raw.keys()) == {"_text"}:
        values.setdefault("text", raw.get("_text", ""))
    return values

LIVE_FIELDS = [
    {"key": "text", "label": "Artiest — Titel", "path": "text"},
    {"key": "title", "label": "Titel", "path": "title"},
    {"key": "artist", "label": "Artiest", "path": "artist"},
    {"key": "artwork", "label": "Hoesje (afbeelding)", "path": "artwork"},
]

NOWPLAYING_FIELDS = [
    {"key": "artist", "label": "Artist", "path": "artist"},
    {"key": "title", "label": "Title", "path": "title"},
    {"key": "song", "label": "Song (full)", "path": "song"},
    {"key": "artwork", "label": "Album cover", "path": "artwork"},
]

def _prep_builtin(body: SourceInput) -> dict:
    if body.type == "builtin_nowplaying":
        return {"url": body.url, "fields": [dict(f) for f in NOWPLAYING_FIELDS],
                "song_path": body.song_path or "", "separator": body.separator or " - ",
                "artwork": True if body.artwork is None else bool(body.artwork),
                "reverse": bool(body.reverse), "refresh_interval": int(body.refresh_interval or 15)}
    if body.type == "builtin_live":
        return {"url": "", "fields": [dict(f) for f in LIVE_FIELDS]}
    if body.type == "builtin_weather":
        lat = body.latitude if body.latitude is not None else 50.85
        lon = body.longitude if body.longitude is not None else 4.35
        url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
               "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code")
        fields = [
            {"key": "temperature", "label": "Temperature (°C)", "path": "current.temperature_2m"},
            {"key": "humidity", "label": "Humidity (%)", "path": "current.relative_humidity_2m"},
            {"key": "wind", "label": "Wind (km/h)", "path": "current.wind_speed_10m"},
        ]
        return {"url": url, "fields": fields, "latitude": lat, "longitude": lon}
    if body.type == "builtin_time":
        return {"url": "", "fields": [], "timezone": body.timezone or "Europe/Brussels"}
    # Custom API: respect explicit response format (text | json | image)
    fmt = (body.format or "").strip().lower()
    if fmt == "text":
        return {"url": body.url, "fields": [{"key": "text", "label": "Response text", "path": "_text"}], "format": "text"}
    if fmt == "image":
        img_path = (body.image_path or "").strip() or "_text"
        return {"url": body.url, "fields": [{"key": "image", "label": "Image URL", "path": img_path}],
                "format": "image", "image_path": (body.image_path or "").strip()}
    fields = [f.model_dump() for f in body.fields]
    has_mapping = any((f.get("key") or "").strip() for f in fields)
    if not has_mapping:
        # No explicit format & no mappings: expose the whole response as "text"
        fields = [{"key": "text", "label": "Response text", "path": "_text"}]
        return {"url": body.url, "fields": fields, "format": "text"}
    return {"url": body.url, "fields": fields, "format": "json"}

async def _get_or_create_live_source(user: dict, workspace_id: str) -> dict:
    src = await db.sources.find_one({"user_id": user["id"], "workspace_id": workspace_id, "type": "builtin_live"})
    if src:
        return src
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "workspace_id": workspace_id,
        "name": "Nu Speelt (live)", "type": "builtin_live", "url": "", "method": "GET",
        "headers": {}, "refresh_interval": 5, "fields": [dict(f) for f in LIVE_FIELDS],
        "live": {}, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sources.insert_one(doc)
    return doc

@api_router.get("/sources/live")
async def get_live_source(workspace_id: str, user: dict = Depends(get_current_user)):
    src = await _get_or_create_live_source(user, workspace_id)
    src.pop("_id", None)
    src.pop("last_raw", None)
    return src

@api_router.post("/sources/live")
async def set_live_song(body: LiveSongInput, user: dict = Depends(get_current_user)):
    src = await _get_or_create_live_source(user, body.workspace_id)
    title = (body.title or "").strip()
    artist = (body.artist or "").strip()
    text = " - ".join([x for x in [artist, title] if x])
    live = {
        "title": title, "artist": artist, "artwork": body.artwork or "",
        "preview": body.preview or "", "text": text,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sources.update_one({"id": src["id"]}, {"$set": {"live": live}})
    return {"ok": True, "source_id": src["id"], "live": live}

@api_router.delete("/sources/live")
async def clear_live_song(workspace_id: str, user: dict = Depends(get_current_user)):
    src = await _get_or_create_live_source(user, workspace_id)
    await db.sources.update_one({"id": src["id"]}, {"$set": {"live": {}}})
    return {"ok": True}


@api_router.get("/sources")
async def list_sources(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.sources.find(q, {"last_raw": 0}).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.get("/sources/values")
async def resolve_all_source_values(workspace_id: str, user: dict = Depends(get_current_user)):
    """Resolve every source in a workspace to a {sourceId:fieldKey -> value} map for live editor previews."""
    srcs = await db.sources.find({"user_id": user["id"], "workspace_id": workspace_id}).to_list(200)
    out = {}
    for s in srcs:
        try:
            vals = await resolve_source_values(s)
        except Exception:
            vals = {}
        for k, v in (vals or {}).items():
            if k.startswith("_"):
                continue
            out[f"{s['id']}:{k}"] = v
    return out


@api_router.post("/sources")
async def create_source(body: SourceInput, user: dict = Depends(get_current_user)):
    prep = _prep_builtin(body)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "workspace_id": body.workspace_id,
        "name": body.name,
        "type": body.type,
        "url": prep.get("url", body.url),
        "method": body.method,
        "headers": body.headers,
        "refresh_interval": body.refresh_interval,
        "fields": prep.get("fields", []),
        "latitude": prep.get("latitude", body.latitude),
        "longitude": prep.get("longitude", body.longitude),
        "timezone": prep.get("timezone", body.timezone),
        "song_path": prep.get("song_path"),
        "separator": prep.get("separator"),
        "artwork": prep.get("artwork"),
        "reverse": prep.get("reverse"),
        "format": prep.get("format"),
        "image_path": prep.get("image_path"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sources.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/sources/{source_id}")
async def update_source(source_id: str, body: SourceInput, user: dict = Depends(get_current_user)):
    existing = await db.sources.find_one({"id": source_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Source not found")
    prep = _prep_builtin(body)
    upd = {
        "name": body.name, "type": body.type, "url": prep.get("url", body.url),
        "method": body.method, "headers": body.headers,
        "refresh_interval": body.refresh_interval, "fields": prep.get("fields", []),
        "latitude": prep.get("latitude", body.latitude),
        "longitude": prep.get("longitude", body.longitude),
        "timezone": prep.get("timezone", body.timezone),
        "song_path": prep.get("song_path"),
        "separator": prep.get("separator"),
        "artwork": prep.get("artwork"),
        "reverse": prep.get("reverse"),
        "format": prep.get("format"),
        "image_path": prep.get("image_path"),
        "last_raw": None, "last_fetched": None,
    }
    await db.sources.update_one({"id": source_id}, {"$set": upd})
    doc = await db.sources.find_one({"id": source_id}, {"_id": 0, "last_raw": 0})
    return doc

@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: str, user: dict = Depends(get_current_user)):
    await db.sources.delete_one({"id": source_id, "user_id": user["id"]})
    return {"ok": True}

@api_router.post("/sources/{source_id}/test")
async def test_source(source_id: str, user: dict = Depends(get_current_user)):
    source = await db.sources.find_one({"id": source_id, "user_id": user["id"]})
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    values = await resolve_source_values(source)
    refreshed = await db.sources.find_one({"id": source_id})
    return {"values": values, "error": refreshed.get("last_error"),
            "raw": refreshed.get("last_raw")}

# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------
@api_router.get("/scenes")
async def list_scenes(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.scenes.find(q).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/scenes")
async def create_scene(body: SceneInput, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "workspace_id": body.workspace_id,
        "name": body.name,
        "width": body.width,
        "height": body.height,
        "background": body.background,
        "elements": body.elements,
        "flows": body.flows,
        "public_token": uuid.uuid4().hex,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.scenes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/scenes/{scene_id}")
async def get_scene(scene_id: str, user: dict = Depends(get_current_user)):
    doc = await db.scenes.find_one({"id": scene_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Scene not found")
    return doc

@api_router.put("/scenes/{scene_id}")
async def update_scene(scene_id: str, body: SceneInput, user: dict = Depends(get_current_user)):
    existing = await db.scenes.find_one({"id": scene_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Scene not found")
    await db.scenes.update_one({"id": scene_id}, {"$set": {
        "name": body.name, "width": body.width, "height": body.height,
        "background": body.background, "elements": body.elements,
        "flows": body.flows,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    doc = await db.scenes.find_one({"id": scene_id}, {"_id": 0})
    return doc

@api_router.delete("/scenes/{scene_id}")
async def delete_scene(scene_id: str, user: dict = Depends(get_current_user)):
    await db.scenes.delete_one({"id": scene_id, "user_id": user["id"]})
    return {"ok": True}

@api_router.post("/scenes/{scene_id}/regenerate-token")
async def regenerate_token(scene_id: str, user: dict = Depends(get_current_user)):
    existing = await db.scenes.find_one({"id": scene_id, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Scene not found")
    token = uuid.uuid4().hex
    await db.scenes.update_one({"id": scene_id}, {"$set": {"public_token": token}})
    return {"public_token": token}

# ---------------------------------------------------------------------------
# Pancartes (reusable card designs) CRUD
# ---------------------------------------------------------------------------
@api_router.get("/pancartes")
async def list_pancartes(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.pancartes.find(q).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/pancartes")
async def create_pancarte(body: PancarteInput, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "workspace_id": body.workspace_id,
        "name": body.name, "width": body.width, "height": body.height,
        "background": body.background, "elements": body.elements,
        "created_at": now, "updated_at": now,
    }
    await db.pancartes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/pancartes/{pid}")
async def get_pancarte(pid: str, user: dict = Depends(get_current_user)):
    doc = await db.pancartes.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Pancarte not found")
    return doc

@api_router.put("/pancartes/{pid}")
async def update_pancarte(pid: str, body: PancarteInput, user: dict = Depends(get_current_user)):
    existing = await db.pancartes.find_one({"id": pid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Pancarte not found")
    await db.pancartes.update_one({"id": pid}, {"$set": {
        "name": body.name, "width": body.width, "height": body.height,
        "background": body.background, "elements": body.elements,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return await db.pancartes.find_one({"id": pid}, {"_id": 0})

@api_router.delete("/pancartes/{pid}")
async def delete_pancarte(pid: str, user: dict = Depends(get_current_user)):
    await db.pancartes.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}

# ---------------------------------------------------------------------------
# Flows (ordered sequences of pancartes) CRUD
# ---------------------------------------------------------------------------
@api_router.get("/flows")
async def list_flows(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.flows.find(q).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/flows")
async def create_flow(body: FlowInput, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "workspace_id": body.workspace_id,
        "name": body.name, "interval": body.interval, "entrance": body.entrance,
        "entranceDuration": body.entranceDuration, "pancarte_ids": body.pancarte_ids,
        "created_at": now, "updated_at": now,
    }
    await db.flows.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/flows/{fid}")
async def get_flow(fid: str, user: dict = Depends(get_current_user)):
    doc = await db.flows.find_one({"id": fid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Flow not found")
    return doc

@api_router.put("/flows/{fid}")
async def update_flow(fid: str, body: FlowInput, user: dict = Depends(get_current_user)):
    existing = await db.flows.find_one({"id": fid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Flow not found")
    await db.flows.update_one({"id": fid}, {"$set": {
        "name": body.name, "interval": body.interval, "entrance": body.entrance,
        "entranceDuration": body.entranceDuration, "pancarte_ids": body.pancarte_ids,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return await db.flows.find_one({"id": fid}, {"_id": 0})

@api_router.delete("/flows/{fid}")
async def delete_flow(fid: str, user: dict = Depends(get_current_user)):
    await db.flows.delete_one({"id": fid, "user_id": user["id"]})
    return {"ok": True}

async def expand_scene_flows(scene: dict) -> dict:
    """Attach resolved flow + pancarte docs to each scene flow placement (for the overlay)."""
    for pl in scene.get("flows", []):
        flow = None
        if pl.get("flow_id"):
            flow = await db.flows.find_one({"id": pl["flow_id"]}, {"_id": 0})
        pl["_flow"] = flow
        pans = []
        if flow:
            for pid in flow.get("pancarte_ids", []):
                pan = await db.pancartes.find_one({"id": pid}, {"_id": 0})
                if pan:
                    pans.append(pan)
        pl["_pancartes"] = pans
    return scene

# ---------------------------------------------------------------------------
# Data resolution for a scene (shared by data.json / xml / overlay)
# ---------------------------------------------------------------------------
def _sanitize_key(s: str) -> str:
    s = re.sub(r'[^a-zA-Z0-9_]+', '_', (s or "").strip())
    return s.strip('_') or "field"

async def build_scene_data(scene: dict) -> Dict[str, Any]:
    """Return a flat {column: value} dict for vMix data source binding."""
    out: Dict[str, Any] = {}
    # cache source resolution to avoid duplicate fetches
    source_cache: Dict[str, Dict[str, Any]] = {}
    for el in scene.get("elements", []):
        etype = el.get("type")
        props = el.get("props", {})
        name = _sanitize_key(props.get("name") or f"{etype}_{el.get('id','')[:6]}")
        if etype in ("text", "timed_text"):
            out[name] = props.get("text", "")
        elif etype == "clock":
            out[name] = datetime.now(timezone.utc).isoformat()
        elif etype == "api_field":
            sid = props.get("sourceId")
            if sid and sid not in source_cache:
                src = await db.sources.find_one({"id": sid})
                source_cache[sid] = await resolve_source_values(src) if src else {}
            val = source_cache.get(sid, {}).get(props.get("fieldKey"))
            out[name] = val if val is not None else ""
        elif etype == "image" and props.get("sourceId") and props.get("fieldKey"):
            sid = props.get("sourceId")
            if sid not in source_cache:
                src = await db.sources.find_one({"id": sid})
                source_cache[sid] = await resolve_source_values(src) if src else {}
            val = source_cache.get(sid, {}).get(props.get("fieldKey"))
            out[name] = val if val is not None else ""
    return out

async def resolve_element_value(el: dict) -> str:
    p = el.get("props", {})
    t = el.get("type")
    if t == "text":
        return p.get("text", "")
    if t == "image":
        return p.get("src", "")
    if t == "clock":
        return format_clock_py(p.get("timezone"), p.get("format"))
    if t == "timed_text":
        text = p.get("text", "")
        s, e = p.get("start"), p.get("end")
        if not s or not e:
            return text
        try:
            now = datetime.now(ZoneInfo(p.get("timezone") or "UTC"))
        except Exception:
            now = datetime.now(timezone.utc)
        n = now.hour * 60 + now.minute
        sm, em = _hhmm(s), _hhmm(e)
        if sm is None or em is None:
            return text
        vis = (sm <= n <= em) if sm <= em else (n >= sm or n <= em)
        return text if vis else ""
    if t == "api_field":
        src = await db.sources.find_one({"id": p.get("sourceId")})
        vals = await resolve_source_values(src) if src else {}
        v = vals.get(p.get("fieldKey"))
        return (p.get("prefix", "") + (str(v) if v is not None else "") + p.get("suffix", ""))
    return ""

# ---------------------------------------------------------------------------
# Public endpoints (consumed by vMix) - no auth
# ---------------------------------------------------------------------------
async def _get_public_scene(token: str) -> dict:
    scene = await db.scenes.find_one({"public_token": token}, {"_id": 0})
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return scene

@api_router.get("/public/scene/{token}/data.json")
async def public_data_json(token: str):
    scene = await _get_public_scene(token)
    data = await build_scene_data(scene)
    return JSONResponse([data])

@api_router.get("/public/scene/{token}/data.xml")
async def public_data_xml(token: str):
    scene = await _get_public_scene(token)
    data = await build_scene_data(scene)
    def esc(v):
        return (str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    cols = "".join(f"<{k}>{esc(v)}</{k}>" for k, v in data.items())
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<vmix><item>{cols}</item></vmix>'
    return PlainTextResponse(xml, media_type="application/xml")

@api_router.get("/public/scene/{token}/settings")
async def public_settings(token: str):
    scene = await _get_public_scene(token)
    scene.pop("user_id", None)
    backend = os.environ.get("FRONTEND_URL", "")
    scene["vmix"] = {
        "overlay_url": f"{backend}/api/public/scene/{token}/overlay",
        "data_json_url": f"{backend}/api/public/scene/{token}/data.json",
        "data_xml_url": f"{backend}/api/public/scene/{token}/data.xml",
    }
    headers = {"Content-Disposition": f'attachment; filename="{_sanitize_key(scene.get("name","scene"))}.vmixoverlay.json"'}
    return JSONResponse(scene, headers=headers)

@api_router.get("/public/scene/{token}/overlay", response_class=HTMLResponse)
async def public_overlay(token: str):
    scene = await _get_public_scene(token)
    scene = await expand_scene_flows(scene)
    import json as _json
    scene_json = _json.dumps(scene)
    backend = os.environ.get("FRONTEND_URL", "")
    html = OVERLAY_HTML.replace("__SCENE__", scene_json).replace("__TOKEN__", token).replace("__BACKEND__", backend)
    return HTMLResponse(html)

# ---------------------------------------------------------------------------
# Overlay HTML/JS renderer (self-contained, loaded by vMix Web Browser input)
# ---------------------------------------------------------------------------
OVERLAY_HTML = r"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;font-family:'Plus Jakarta Sans',Arial,sans-serif;}
  #stage{position:absolute;top:0;left:0;transform-origin:top left;}
  .el{position:absolute;box-sizing:border-box;display:flex;}
  img.el-img{width:100%;height:100%;}
  @keyframes clara-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
  @keyframes clara-fade{0%,100%{opacity:.15}50%{opacity:1}}
  @keyframes clara-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
  @keyframes clara-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-12%)}}
  @keyframes clara-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6%)}}
  @keyframes clara-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
  @keyframes clara-slide{0%{transform:translateX(-18%)}100%{transform:translateX(18%)}}
  @keyframes clara-in-fade{from{opacity:0}to{opacity:1}}
  @keyframes clara-in-up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
  @keyframes clara-in-down{from{opacity:0;transform:translateY(-40px)}to{opacity:1;transform:translateY(0)}}
  @keyframes clara-in-left{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}
  @keyframes clara-in-right{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}
  @keyframes clara-in-zoom{from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
  @keyframes clara-ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
</style></head>
<script>
function applyAnim(node, p){
  var a = p.animation; if(!a || a==='none') return;
  var dur = p.animationDuration || 2;
  var map = {pulse:'clara-pulse',fade:'clara-fade',spin:'clara-spin',bounce:'clara-bounce',float:'clara-float',blink:'clara-blink',slide:'clara-slide'};
  var name = map[a]; if(!name) return;
  var timing = a==='spin' ? 'linear' : 'ease-in-out';
  var dir = a==='slide' ? ' alternate' : '';
  node.style.animation = name+' '+dur+'s '+timing+' infinite'+dir;
}
function entranceAnim(p){
  var e = p.entrance; if(!e || e==='none') return null;
  var map = {fade:'clara-in-fade','slide-up':'clara-in-up','slide-down':'clara-in-down','slide-left':'clara-in-left','slide-right':'clara-in-right',zoom:'clara-in-zoom'};
  var name = map[e]; if(!name) return null;
  var dur = p.entranceDuration || 0.6; var delay = p.entranceDelay || 0;
  return name+' '+dur+'s ease-out '+delay+'s both';
}
function retriggerEntrance(node, p){
  var a = entranceAnim(p); if(!a) return;
  node.style.animation = 'none'; void node.offsetWidth; node.style.animation = a;
}
</script>
<body>
<div id="stage"></div>
<script>
const SCENE = __SCENE__;
const TOKEN = "__TOKEN__";
const BACKEND = "__BACKEND__";
const stage = document.getElementById('stage');
stage.style.width = SCENE.width + 'px';
stage.style.height = SCENE.height + 'px';
if (SCENE.background && SCENE.background.color) stage.style.background = SCENE.background.color;
if (SCENE.background && SCENE.background.src) {
  var bfit = SCENE.background.fit || 'cover';
  var bg;
  if (SCENE.background.type === 'video') {
    bg = document.createElement('video');
    bg.src = SCENE.background.src; bg.autoplay = true; bg.loop = true; bg.muted = true;
    bg.setAttribute('playsinline', ''); bg.setAttribute('muted', '');
    bg.style.width = '100%'; bg.style.height = '100%'; bg.style.objectFit = bfit === 'contain' ? 'contain' : 'cover';
  } else if (bfit === 'repeat') {
    bg = document.createElement('div');
    bg.style.width = '100%'; bg.style.height = '100%';
    bg.style.backgroundImage = 'url(' + SCENE.background.src + ')'; bg.style.backgroundRepeat = 'repeat';
  } else {
    bg = document.createElement('img'); bg.src = SCENE.background.src;
    bg.style.width = '100%'; bg.style.height = '100%'; bg.style.objectFit = bfit === 'contain' ? 'contain' : 'cover';
  }
  bg.style.position = 'absolute'; bg.style.top = 0; bg.style.left = 0;
  stage.appendChild(bg);
}
if (SCENE.background && SCENE.background.overlayColor && (SCENE.background.overlayOpacity || 0) > 0) {
  var ov = document.createElement('div');
  ov.style.position = 'absolute'; ov.style.top = 0; ov.style.left = 0;
  ov.style.width = '100%'; ov.style.height = '100%';
  ov.style.background = SCENE.background.overlayColor; ov.style.opacity = SCENE.background.overlayOpacity;
  stage.appendChild(ov);
}

function fit(){
  const sx = window.innerWidth / SCENE.width;
  const sy = window.innerHeight / SCENE.height;
  const s = Math.min(sx, sy);
  stage.style.transform = 'scale(' + s + ')';
}
window.addEventListener('resize', fit); fit();

function baseStyle(el){
  const st = el.style || {};
  const d = document.createElement('div');
  d.className = 'el';
  d.style.left = el.x + 'px'; d.style.top = el.y + 'px';
  d.style.width = el.w + 'px'; d.style.height = el.h + 'px';
  if (el.rotation) d.style.transform = 'rotate(' + el.rotation + 'deg)';
  if (el.opacity != null) d.style.opacity = el.opacity;
  if (st.backgroundColor) d.style.background = st.backgroundColor;
  if (st.borderRadius != null) d.style.borderRadius = st.borderRadius + 'px';
  if (st.borderWidth) d.style.border = st.borderWidth + 'px solid ' + (st.borderColor||'#fff');
  if (st.padding != null) d.style.padding = st.padding + 'px';
  d.style.color = st.color || '#ffffff';
  d.style.fontSize = (st.fontSize||40) + 'px';
  d.style.fontFamily = st.fontFamily || "'Plus Jakarta Sans',Arial,sans-serif";
  d.style.fontWeight = st.fontWeight || 600;
  if (st.fontStyle) d.style.fontStyle = st.fontStyle;
  if (st.letterSpacing) d.style.letterSpacing = st.letterSpacing + 'px';
  if (st.lineHeight) d.style.lineHeight = st.lineHeight;
  if (st.textShadow) d.style.textShadow = st.textShadow;
  const align = st.textAlign || 'left';
  d.style.justifyContent = align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start');
  d.style.alignItems = st.verticalAlign === 'top' ? 'flex-start' : (st.verticalAlign === 'bottom' ? 'flex-end' : 'center');
  d.style.textAlign = align;
  d.style.overflow = 'hidden';
  return d;
}

function fmtClock(tz, format){
  const now = new Date();
  const parts = {};
  try{
    const df = new Intl.DateTimeFormat('en-GB', {timeZone: tz||'UTC', hour12:false,
      year:'numeric', month:'long', day:'2-digit', weekday:'long',
      hour:'2-digit', minute:'2-digit', second:'2-digit'});
    df.formatToParts(now).forEach(p => parts[p.type] = p.value);
  }catch(e){}
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let f = format || 'HH:mm:ss';
  return f
    .replace('dddd', parts.weekday||'')
    .replace('YYYY', parts.year||'')
    .replace('MMMM', parts.month||'')
    .replace('MM', String((months.indexOf(parts.month)+1)||'').padStart(2,'0'))
    .replace('DD', parts.day||'')
    .replace('HH', parts.hour||'')
    .replace('mm', parts.minute||'')
    .replace('ss', parts.second||'');
}

function nowMinutes(tz){
  const parts = {};
  try{
    new Intl.DateTimeFormat('en-GB',{timeZone:tz||'UTC',hour12:false,hour:'2-digit',minute:'2-digit'})
      .formatToParts(new Date()).forEach(p=>parts[p.type]=p.value);
  }catch(e){ return new Date().getHours()*60+new Date().getMinutes(); }
  return parseInt(parts.hour||'0')*60 + parseInt(parts.minute||'0');
}
function toMin(hhmm){ if(!hhmm) return null; const [h,m]=hhmm.split(':'); return parseInt(h)*60+parseInt(m); }

const clocks = [];
const timeds = [];
const apiEls = [];
const imageApis = [];
var lastValues = {};

function buildElementNode(el){
  const p = el.props || {};
  const d = baseStyle(el);
  const ent = document.createElement('div');
  ent.style.width='100%'; ent.style.height='100%'; ent.style.display='flex';
  ent.style.justifyContent='inherit'; ent.style.alignItems='inherit';
  var ea = entranceAnim(p); if(ea) ent.style.animation = ea;
  const inner = document.createElement('div');
  inner.style.width='100%'; inner.style.height='100%'; inner.style.display='flex';
  inner.style.justifyContent='inherit'; inner.style.alignItems='inherit';
  applyAnim(inner, p);
  var ref = {node:d, clock:null, api:null, timed:null, imgApi:null};
  if(el.type==='image'){
    var img=document.createElement('img'); img.style.width='100%'; img.style.height='100%';
    img.style.objectFit=(el.style&&el.style.objectFit)||'contain';
    if(p.sourceId && p.fieldKey){ ref.imgApi={img:img, p:p}; if(p.src) img.src=p.src; }
    else if(p.src){ img.src=p.src; }
    inner.appendChild(img);
  } else if(el.type==='clock'){
    inner.textContent = fmtClock(p.timezone, p.format);
    ref.clock = {d:inner, p:p};
  } else if(el.type==='timed_text'){
    var wrap=document.createElement('div'); wrap.style.display='flex'; wrap.style.flexDirection=p.imagePosition==='top'?'column':'row';
    wrap.style.alignItems='center'; wrap.style.gap='16px'; wrap.style.width='100%'; wrap.style.height='100%';
    if(p.image){ var im=document.createElement('img'); im.src=p.image; im.style.objectFit='cover';
      im.style.height=p.imagePosition==='top'?'60%':'100%'; im.style.borderRadius='12px'; wrap.appendChild(im); }
    var txt=document.createElement('div'); txt.textContent=p.text||''; txt.style.flex='1'; wrap.appendChild(txt);
    inner.appendChild(wrap);
    ref.timed = {d:d, p:p, ent:ent};
  } else if(el.type==='api_field'){
    if(p.display==='image'){
      var aim=document.createElement('img'); aim.style.width='100%'; aim.style.height='100%';
      aim.style.objectFit=(el.style&&el.style.objectFit)||'contain';
      if(p.src) aim.src=p.src;
      inner.appendChild(aim);
      ref.imgApi={img:aim, p:p};
    } else {
      inner.textContent = (p.prefix||'') + '\u2026' + (p.suffix||'');
      ref.api = {d:inner, p:p};
    }
  } else if(el.type==='overlay'){
    var ok = p.kind||''; var ofit = (el.style&&el.style.objectFit)||'contain';
    if(ok==='html' && p.url){ var fr=document.createElement('iframe'); fr.src=p.url; fr.setAttribute('scrolling','no');
      fr.setAttribute('allowtransparency','true'); fr.style.width='100%'; fr.style.height='100%'; fr.style.border='0'; fr.style.background='transparent'; inner.appendChild(fr); }
    else if(ok==='video' && p.url){ var vo=document.createElement('video'); vo.src=p.url; vo.autoplay=true; vo.loop=true; vo.muted=true;
      vo.setAttribute('playsinline',''); vo.setAttribute('muted',''); vo.style.width='100%'; vo.style.height='100%'; vo.style.objectFit=ofit; inner.appendChild(vo); }
    else if(p.url){ var io=document.createElement('img'); io.src=p.url; io.style.width='100%'; io.style.height='100%'; io.style.objectFit=ofit; inner.appendChild(io); }
  } else if(el.type==='ticker'){
    inner.style.overflow='hidden'; inner.style.whiteSpace='nowrap'; inner.style.display='block';
    var track=document.createElement('div'); track.style.display='inline-block'; track.style.whiteSpace='nowrap'; track.style.willChange='transform';
    inner.appendChild(track);
    function renderTicker(items){
      var sep = ' \\u00A0'+(p.icon||'\\u25CF')+'\\u00A0 ';
      var base = [];
      if(p.freeText) base.push(p.freeText);
      (items||[]).forEach(function(s){ if(s) base.push(s); });
      var one = base.length ? (base.join(sep) + sep) : (p.freeText||'');
      if(!one){ track.textContent=''; return; }
      track.textContent = one + one;
      var secs = Math.max(8, Math.round((one.length) * (parseFloat(p.speed)||0.35)));
      track.style.animation = 'clara-ticker ' + secs + 's linear infinite';
    }
    renderTicker([]);
    if(p.formId){
      var fq = (p.fields && p.fields.length) ? ('?fields=' + encodeURIComponent(p.fields.join(','))) : '';
      function pullTicker(){ fetch(BACKEND + '/api/public/scene/' + TOKEN + '/ticker/' + p.formId + fq).then(function(r){return r.json();}).then(function(d){ renderTicker(d.items||[]); }).catch(function(){}); }
      pullTicker(); setInterval(pullTicker, 10000);
    }
  } else {
    inner.textContent = p.text || '';
  }
  ent.appendChild(inner); d.appendChild(ent);
  return ref;
}

function applyBackground(host, bg){
  if(!bg) return;
  if(bg.color) host.style.background = bg.color;
  if(bg.src){
    var bfit = bg.fit || 'cover'; var b;
    if(bg.type==='video'){ b=document.createElement('video'); b.src=bg.src; b.autoplay=true; b.loop=true; b.muted=true;
      b.setAttribute('playsinline',''); b.setAttribute('muted',''); b.style.width='100%'; b.style.height='100%'; b.style.objectFit=bfit==='contain'?'contain':'cover'; }
    else if(bfit==='repeat'){ b=document.createElement('div'); b.style.width='100%'; b.style.height='100%'; b.style.backgroundImage='url('+bg.src+')'; b.style.backgroundRepeat='repeat'; }
    else { b=document.createElement('img'); b.src=bg.src; b.style.width='100%'; b.style.height='100%'; b.style.objectFit=bfit==='contain'?'contain':'cover'; }
    b.style.position='absolute'; b.style.top=0; b.style.left=0; host.appendChild(b);
  }
  if(bg.overlayColor && (bg.overlayOpacity||0)>0){
    var ov=document.createElement('div'); ov.style.position='absolute'; ov.style.top=0; ov.style.left=0;
    ov.style.width='100%'; ov.style.height='100%'; ov.style.background=bg.overlayColor; ov.style.opacity=bg.overlayOpacity; host.appendChild(ov);
  }
}

(SCENE.elements||[]).forEach(function(el){
  if(el.hidden) return;
  var ref = buildElementNode(el);
  if(ref.clock) clocks.push(ref.clock);
  if(ref.api) apiEls.push(ref.api);
  if(ref.imgApi) imageApis.push(ref.imgApi);
  if(ref.timed) timeds.push(ref.timed);
  stage.appendChild(ref.node);
});

// ---- Flows of pancartes ----
function renderPancarte(pan, w, h){
  var box = document.createElement('div');
  box.style.position='absolute'; box.style.top=0; box.style.left=0; box.style.width=w+'px'; box.style.height=h+'px'; box.style.overflow='hidden';
  var pw = pan.width||1920, ph = pan.height||1080;
  var scale = Math.min(w/pw, h/ph);
  var sw = pw*scale, sh = ph*scale;
  var st = document.createElement('div');
  st.style.position='absolute'; st.style.left=((w-sw)/2)+'px'; st.style.top=((h-sh)/2)+'px';
  st.style.width=pw+'px'; st.style.height=ph+'px'; st.style.transformOrigin='top left'; st.style.transform='scale('+scale+')'; st.style.overflow='hidden';
  applyBackground(st, pan.background);
  var res = {node:box, clocks:[], apis:[], images:[]};
  (pan.elements||[]).forEach(function(el){
    if(el.hidden) return;
    var ref = buildElementNode(el);
    if(ref.clock) res.clocks.push(ref.clock);
    if(ref.api) res.apis.push(ref.api);
    if(ref.imgApi) res.images.push(ref.imgApi);
    st.appendChild(ref.node);
  });
  box.appendChild(st);
  return res;
}

function updateApis(list, values){
  list.forEach(function(a){ var v = values[a.p.sourceId+':'+a.p.fieldKey]; if(v==null) v=''; a.d.textContent=(a.p.prefix||'')+v+(a.p.suffix||''); });
}
function updateImages(list, values){
  list.forEach(function(a){ var v = values[a.p.sourceId+':'+a.p.fieldKey]; if(v && a.img.getAttribute('src')!==v){ a.img.src=v; } });
}
function buildOverlayNode(ov){
  if(!ov || !ov.url) return null;
  var wrap=document.createElement('div');
  wrap.style.position='absolute'; wrap.style.top=0; wrap.style.left=0; wrap.style.width='100%'; wrap.style.height='100%'; wrap.style.display='none';
  var k=ov.kind||''; var fit=ov.fit||'contain'; var node;
  if(k==='html'){ node=document.createElement('iframe'); node.src=ov.url; node.setAttribute('scrolling','no'); node.setAttribute('allowtransparency','true'); node.style.border='0'; node.style.background='transparent'; }
  else if(k==='video'){ node=document.createElement('video'); node.src=ov.url; node.autoplay=true; node.loop=true; node.muted=true; node.setAttribute('playsinline',''); node.setAttribute('muted',''); node.style.objectFit=fit; }
  else { node=document.createElement('img'); node.src=ov.url; node.style.objectFit=fit; }
  node.style.width='100%'; node.style.height='100%';
  wrap.appendChild(node); return wrap;
}

var placements = [];
(SCENE.flows||[]).forEach(function(pl){
  var flow = pl._flow || null;
  var pans = pl._pancartes || [];
  var sc = pl.schedule||{};
  var cont = document.createElement('div');
  cont.style.position='absolute'; cont.style.left=pl.x+'px'; cont.style.top=pl.y+'px';
  cont.style.width=pl.w+'px'; cont.style.height=pl.h+'px'; cont.style.overflow='hidden';
  stage.appendChild(cont);

  var seriesLayer=document.createElement('div'); seriesLayer.style.position='absolute'; seriesLayer.style.top=0; seriesLayer.style.left=0; seriesLayer.style.width='100%'; seriesLayer.style.height='100%';
  cont.appendChild(seriesLayer);
  var introNode = buildOverlayNode(sc.intro);
  var outroNode = buildOverlayNode(sc.outro);
  if(introNode) cont.appendChild(introNode);
  if(outroNode) cont.appendChild(outroNode);

  var idx=-1, adv=null, cur={clocks:[],apis:[],images:[]};
  function render(i){
    seriesLayer.innerHTML='';
    if(!pans.length){ cur={clocks:[],apis:[],images:[]}; return; }
    var pan = pans[((i%pans.length)+pans.length)%pans.length];
    var r = renderPancarte(pan, pl.w, pl.h);
    var ea = entranceAnim({entrance: flow?flow.entrance:'none', entranceDuration: flow?flow.entranceDuration:0.6});
    if(ea) r.node.style.animation = ea;
    seriesLayer.appendChild(r.node);
    cur = {clocks:r.clocks, apis:r.apis, images:r.images};
    cur.clocks.forEach(function(c){ c.d.textContent = fmtClock(c.p.timezone, c.p.format); });
    updateApis(cur.apis, lastValues);
    updateImages(cur.images, lastValues);
  }
  function advance(){ render(idx+1); idx++; }
  function startAdv(){ if(!adv && pans.length>1){ adv=setInterval(advance, Math.max(1,(flow&&flow.interval)||5)*1000); } }
  function stopAdv(){ if(adv){ clearInterval(adv); adv=null; } }

  if(sc.mode==='everyX'){
    cont.style.display='block'; seriesLayer.style.display='none';
  } else {
    render(0); idx=0; startAdv();
  }
  placements.push({pl:pl, flow:flow, pans:pans, cont:cont, seriesLayer:seriesLayer, introNode:introNode, outroNode:outroNode,
    getCur:function(){return cur;}, setIdx:function(i){ if(i!==idx){ render(i); idx=i; } }, _state:null});
});

function showTimedPart(node, on){
  if(!node) return;
  if(on){ if(node.style.display!=='block'){ node.style.display='block'; node.style.animation='clara-in-fade .4s ease-out both'; } }
  else { node.style.display='none'; }
}

function tick(){
  clocks.forEach(function(c){ c.d.textContent = fmtClock(c.p.timezone, c.p.format); });
  timeds.forEach(function(t){
    var s=toMin(t.p.start), e=toMin(t.p.end); var vis=true;
    if(s!=null && e!=null){ var n=nowMinutes(t.p.timezone); vis = s<=e ? (n>=s && n<=e) : (n>=s || n<=e); }
    if(vis && t._vis!==true){ t.d.style.display='flex'; retriggerEntrance(t.ent, t.p); }
    else if(!vis && t._vis!==false){ t.d.style.display='none'; }
    t._vis=vis;
  });
  placements.forEach(function(f){
    var sc=f.pl.schedule||{};
    if(sc.mode==='everyX'){
      var cycle=Math.max(1,(sc.everyMinutes||5))*60;
      var per=Math.max(1,(f.flow&&f.flow.interval)||5);
      var count=f.pans.length;
      var lead=(f.introNode && sc.intro)?Math.max(0,(sc.intro.leadSeconds!=null?sc.intro.leadSeconds:10)):0;
      var showDur=Math.max(1,(sc.showSeconds!=null?sc.showSeconds:20));
      var outroDur=(f.outroNode && sc.outro)?Math.max(1,(sc.outro.seconds!=null?sc.outro.seconds:5)):0;
      var d=new Date();
      var secOfDay=d.getHours()*3600+d.getMinutes()*60+d.getSeconds();
      var phase=secOfDay%cycle;
      var state='none', panIdx=0;
      if(lead>0 && phase<lead){ state='intro'; }
      else if(count>0 && phase>=lead && phase<lead+showDur){ state='series'; panIdx=Math.floor((phase-lead)/per)%count; }
      else if(phase<lead+showDur+outroDur){ state='outro'; }
      showTimedPart(f.introNode, state==='intro');
      showTimedPart(f.outroNode, state==='outro');
      if(state==='series'){ if(f._state!=='series') f.seriesLayer.style.display='block'; f.setIdx(panIdx); }
      else if(f._state==='series'){ f.seriesLayer.style.display='none'; }
      f._state=state;
    }
    var cur=f.getCur(); cur.clocks.forEach(function(c){ c.d.textContent=fmtClock(c.p.timezone,c.p.format); });
  });
}
setInterval(tick, 1000); tick();

async function poll(){
  try{
    const r = await fetch(BACKEND + '/api/public/scene/' + TOKEN + '/values.json');
    const data = await r.json();
    lastValues = data;
    updateApis(apiEls, data);
    updateImages(imageApis, data);
    placements.forEach(function(f){ updateApis(f.getCur().apis, data); updateImages(f.getCur().images, data); });
  }catch(e){}
}
setInterval(poll, 5000); poll();
</script>
</body></html>"""

@api_router.get("/public/scene/{token}/values.json")
async def public_values(token: str):
    """Raw source values keyed by sourceId:fieldKey for overlay polling (scene + pancarte elements)."""
    scene = await _get_public_scene(token)
    out: Dict[str, Any] = {}
    cache: Dict[str, Dict[str, Any]] = {}

    async def add_el(el):
        if el.get("type") not in ("api_field", "image"):
            return
        p = el.get("props", {})
        sid = p.get("sourceId")
        fk = p.get("fieldKey")
        if not sid or not fk:
            return
        if sid not in cache:
            src_doc = await db.sources.find_one({"id": sid})
            cache[sid] = await resolve_source_values(src_doc) if src_doc else {}
        out[f"{sid}:{fk}"] = cache.get(sid, {}).get(fk, "")

    for el in scene.get("elements", []):
        await add_el(el)
    for pl in scene.get("flows", []):
        if not pl.get("flow_id"):
            continue
        flow = await db.flows.find_one({"id": pl["flow_id"]})
        if not flow:
            continue
        for pid in flow.get("pancarte_ids", []):
            pan = await db.pancartes.find_one({"id": pid})
            if not pan:
                continue
            for el in pan.get("elements", []):
                await add_el(el)
    return JSONResponse(out)

@api_router.get("/public/scene/{token}/element/{element_id}.txt", response_class=PlainTextResponse)
async def public_element_txt(token: str, element_id: str):
    scene = await _get_public_scene(token)
    el = next((e for e in scene.get("elements", []) if e.get("id") == element_id), None)
    if not el:
        raise HTTPException(status_code=404, detail="Element not found")
    return PlainTextResponse(str(await resolve_element_value(el)))

@api_router.get("/public/scene/{token}/element/{element_id}.json")
async def public_element_json(token: str, element_id: str):
    scene = await _get_public_scene(token)
    el = next((e for e in scene.get("elements", []) if e.get("id") == element_id), None)
    if not el:
        raise HTTPException(status_code=404, detail="Element not found")
    p = el.get("props", {})
    return JSONResponse({"id": element_id, "name": p.get("name"), "type": el.get("type"),
                         "value": await resolve_element_value(el)})

# ---------------------------------------------------------------------------
# Forms (website form builder) + Submissions (messages)
# ---------------------------------------------------------------------------
@api_router.get("/forms")
async def list_forms(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    docs = await db.forms.find(q).sort("created_at", -1).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/forms")
async def create_form(body: FormInput, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "workspace_id": body.workspace_id,
        "name": body.name, "description": body.description, "fields": body.fields,
        "public_token": uuid.uuid4().hex,
        "created_at": now, "updated_at": now,
    }
    await db.forms.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/forms/{fid}")
async def get_form(fid: str, user: dict = Depends(get_current_user)):
    doc = await db.forms.find_one({"id": fid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Form not found")
    return doc

@api_router.put("/forms/{fid}")
async def update_form(fid: str, body: FormInput, user: dict = Depends(get_current_user)):
    existing = await db.forms.find_one({"id": fid, "user_id": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Form not found")
    await db.forms.update_one({"id": fid}, {"$set": {
        "name": body.name, "description": body.description, "fields": body.fields,
        "updated_at": datetime.now(timezone.utc).isoformat()}})
    return await db.forms.find_one({"id": fid}, {"_id": 0})

@api_router.delete("/forms/{fid}")
async def delete_form(fid: str, user: dict = Depends(get_current_user)):
    await db.forms.delete_one({"id": fid, "user_id": user["id"]})
    await db.submissions.delete_many({"form_id": fid, "user_id": user["id"]})
    return {"ok": True}

@api_router.get("/submissions")
async def list_submissions(workspace_id: Optional[str] = None, form_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"]}
    if workspace_id:
        q["workspace_id"] = workspace_id
    if form_id:
        q["form_id"] = form_id
    docs = await db.submissions.find(q).sort("created_at", -1).to_list(1000)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.get("/submissions/unread-count")
async def unread_count(workspace_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"user_id": user["id"], "read": False}
    if workspace_id:
        q["workspace_id"] = workspace_id
    return {"count": await db.submissions.count_documents(q)}

@api_router.post("/submissions/{sid}/read")
async def mark_submission_read(sid: str, user: dict = Depends(get_current_user)):
    await db.submissions.update_one({"id": sid, "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}

@api_router.delete("/submissions/{sid}")
async def delete_submission(sid: str, user: dict = Depends(get_current_user)):
    await db.submissions.delete_one({"id": sid, "user_id": user["id"]})
    return {"ok": True}

def _submission_ticker_text(form: dict, data: dict, keys: list = None) -> str:
    fields_by_key = {f.get("key"): f for f in (form.get("fields") or [])}
    order = [k for k in keys if k in fields_by_key] if keys else [f.get("key") for f in (form.get("fields") or [])]
    parts = []
    for k in order:
        v = (data or {}).get(k)
        if v is None or v == "":
            continue
        if isinstance(v, list):
            if v and isinstance(v[0], dict):
                s = v[0]
                combo = " - ".join([x for x in [s.get("artist") or "", s.get("title") or s.get("trackName") or ""] if x])
                if combo:
                    parts.append(combo)
            continue
        if isinstance(v, (str, int, float)):
            sv = str(v).strip()
            if sv:
                parts.append(sv)
    return " \u00B7 ".join(parts)

@api_router.post("/submissions/{sid}/ticker")
async def toggle_submission_ticker(sid: str, body: Dict[str, Any], user: dict = Depends(get_current_user)):
    on = bool(body.get("on", True))
    await db.submissions.update_one({"id": sid, "user_id": user["id"]}, {"$set": {"ticker": on}})
    return {"ok": True, "ticker": on}

async def _ticker_items_for_form(form: dict, keys: list = None) -> list:
    if not form:
        return []
    subs = await db.submissions.find({"form_id": form["id"], "ticker": True}).sort("created_at", -1).to_list(50)
    items = []
    for s in subs:
        t = _submission_ticker_text(form, s.get("data") or {}, keys)
        if t:
            items.append(t)
    return items

def _parse_keys(fields: Optional[str]) -> Optional[list]:
    if not fields:
        return None
    ks = [k.strip() for k in fields.split(",") if k.strip()]
    return ks or None

@api_router.get("/forms/{fid}/ticker-items")
async def form_ticker_items(fid: str, fields: Optional[str] = None, user: dict = Depends(get_current_user)):
    form = await db.forms.find_one({"id": fid, "user_id": user["id"]})
    return {"items": await _ticker_items_for_form(form, _parse_keys(fields))}

@api_router.get("/public/scene/{token}/ticker/{form_id}")
async def public_ticker_items(token: str, form_id: str, fields: Optional[str] = None):
    scene = await db.scenes.find_one({"public_token": token})
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    form = await db.forms.find_one({"id": form_id, "user_id": scene.get("user_id")})
    return {"items": await _ticker_items_for_form(form, _parse_keys(fields))}

# ---- Public form endpoints (consumed by external websites, permissive CORS) ----
HONEYPOT_FIELD = "_gotcha"
RATE_LIMIT_MAX = 8            # max submissions ...
RATE_LIMIT_WINDOW = 60       # ... per this many seconds, per IP + form
_submit_hits: Dict[str, List[float]] = {}

def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def _rate_limited(key: str) -> bool:
    import time as _t
    now = _t.monotonic()
    hits = [t for t in _submit_hits.get(key, []) if now - t < RATE_LIMIT_WINDOW]
    if len(hits) >= RATE_LIMIT_MAX:
        _submit_hits[key] = hits
        return True
    hits.append(now)
    _submit_hits[key] = hits
    return False

@api_router.get("/public/form/{token}")
async def public_get_form(token: str):
    form = await db.forms.find_one({"public_token": token}, {"_id": 0})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    base = os.environ.get("FRONTEND_URL", "")
    def field_out(f):
        o = {
            "key": f.get("key"), "label": f.get("label", ""), "type": f.get("type", "text"),
            "required": bool(f.get("required", False)), "options": f.get("options", []),
        }
        if f.get("type") == "song_pick":
            o["max"] = int(f.get("max", 1) or 1)
            o["mode"] = f.get("mode", "single")
            o["search_url"] = f"{base}/api/public/itunes/search"
            o["result_fields"] = ["id", "title", "artist", "artwork", "preview"]
        return o
    return {
        "id": form["id"], "name": form.get("name", ""), "description": form.get("description", ""),
        "fields": [field_out(f) for f in form.get("fields", [])],
        "submit_url": f"{base}/api/public/form/{token}/submit",
        "song_search_url": f"{base}/api/public/itunes/search",
        "honeypot_field": HONEYPOT_FIELD,
    }

@api_router.get("/public/itunes/search")
async def public_itunes_search(term: str = "", limit: int = 12):
    """Live song search proxy (iTunes). Returns cover + 30s preview per track. Open CORS."""
    term = (term or "").strip()
    if not term:
        return JSONResponse([])
    limit = max(1, min(int(limit or 12), 25))
    url = "https://itunes.apple.com/search"
    params = {"term": term, "media": "music", "entity": "song", "limit": limit}
    try:
        r = await asyncio.to_thread(requests.get, url, params=params, timeout=10)
        results = r.json().get("results", [])
    except Exception:
        return JSONResponse([])
    out = []
    for t in results:
        art = t.get("artworkUrl100") or t.get("artworkUrl60") or ""
        out.append({
            "id": str(t.get("trackId") or t.get("collectionId") or ""),
            "title": t.get("trackName", ""),
            "artist": t.get("artistName", ""),
            "album": t.get("collectionName", ""),
            "artwork": art.replace("100x100bb", "200x200bb") if art else "",
            "preview": t.get("previewUrl", ""),
        })
    return JSONResponse(out)

@api_router.post("/public/form/{token}/submit")
async def public_submit_form(token: str, payload: Dict[str, Any], request: Request):
    form = await db.forms.find_one({"public_token": token})
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    data = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Invalid payload")
    # Honeypot: real users leave the hidden field empty; bots fill it.
    # Pretend success (so bots don't retry) but store nothing.
    if data.get(HONEYPOT_FIELD):
        return {"ok": True, "id": None}
    # Simple rate limit per IP + form.
    if _rate_limited(f"{_client_ip(request)}:{token}"):
        raise HTTPException(status_code=429, detail="Too many submissions, please try again later")
    # Drop internal/honeypot keys (real field keys never start with "_").
    data = {k: v for k, v in data.items() if not str(k).startswith("_")}
    for f in form.get("fields", []):
        key = f.get("key")
        # Normalize song_pick values so stored data is always a clean array (be tolerant
        # of integrators who send a JSON string or a single object), then cap to max.
        if f.get("type") == "song_pick":
            v = data.get(key)
            if isinstance(v, str) and v.strip().startswith(("[", "{")):
                try:
                    import json as _j
                    v = _j.loads(v)
                except Exception:
                    pass
            if isinstance(v, dict):
                v = [v]
            if isinstance(v, list):
                data[key] = v[:int(f.get("max", 1) or 1)]
        if f.get("required"):
            v = data.get(key)
            if v is None or v == "" or v == []:
                raise HTTPException(status_code=422, detail=f"Missing required field: {f.get('label') or key}")
    sub = {
        "id": str(uuid.uuid4()), "form_id": form["id"], "user_id": form["user_id"],
        "workspace_id": form.get("workspace_id"), "data": data, "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.submissions.insert_one(sub)
    return {"ok": True, "id": sub["id"]}

@api_router.get("/")
async def root():
    return {"message": "Clara Frames API"}

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.sources.create_index("user_id")
    await db.scenes.create_index("public_token", unique=True)
    await db.workspaces.create_index("user_id")
    await db.forms.create_index("public_token")
    await db.submissions.create_index([("user_id", 1), ("workspace_id", 1), ("read", 1)])
    # seed admin with MFA enabled + known secret (for automated testing)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin_secret = os.environ.get("ADMIN_TOTP_SECRET", pyotp.random_base32())
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Admin", "role": "admin", "totp_secret": admin_secret,
            "mfa_enabled": True, "created_at": datetime.now(timezone.utc).isoformat()})
    else:
        upd = {"totp_secret": admin_secret, "mfa_enabled": True}
        if not verify_password(admin_password, existing["password_hash"]):
            upd["password_hash"] = hash_password(admin_password)
        await db.users.update_one({"email": admin_email}, {"$set": upd})

    # seed permanent admin (Yannick): create-if-missing, always keep admin role.
    # mfa_enabled=False -> first login forces the user to set up their own authenticator (QR).
    yannick_email = "yannick.gijbels@koodh.com"
    existing_y = await db.users.find_one({"email": yannick_email})
    if not existing_y:
        await db.users.insert_one({
            "email": yannick_email, "password_hash": hash_password("KYLovie13monx"),
            "name": "Yannick Gijbels", "role": "admin", "totp_secret": pyotp.random_base32(),
            "mfa_enabled": False, "created_at": datetime.now(timezone.utc).isoformat()})
    elif existing_y.get("role") != "admin":
        await db.users.update_one({"email": yannick_email}, {"$set": {"role": "admin"}})

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PublicFormCORSMiddleware(BaseHTTPMiddleware):
    """Allow any website to fetch/submit public forms (no credentials)."""
    async def dispatch(self, request, call_next):
        if request.url.path.startswith("/api/public/"):
            if request.method == "OPTIONS":
                return Response(status_code=200, headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Access-Control-Max-Age": "86400",
                })
            response = await call_next(request)
            response.headers["Access-Control-Allow-Origin"] = "*"
            return response
        return await call_next(request)

app.add_middleware(PublicFormCORSMiddleware)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
