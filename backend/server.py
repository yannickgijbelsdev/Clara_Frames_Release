from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import io
import re
import uuid
import base64
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

import jwt
import bcrypt
import pyotp
import qrcode
import requests
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
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
ISSUER = "vMix Overlay Studio"

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
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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

class SceneInput(BaseModel):
    name: str
    width: int = 1920
    height: int = 1080
    background: Dict[str, Any] = {"color": "#0b1020"}
    elements: List[Dict[str, Any]] = []

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
    if not pyotp.TOTP(user["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    set_auth_cookies(response, str(user["_id"]), user["email"])
    return {"id": str(user["_id"]), "email": user["email"], "name": user.get("name"), "role": user.get("role")}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

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

async def resolve_source_values(source: dict) -> Dict[str, Any]:
    """Fetch (respecting cache) and resolve configured field values."""
    if source.get("type") == "builtin_time":
        tz = source.get("timezone") or "UTC"
        return {"_tz": tz}
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
    values = {}
    for f in source.get("fields", []):
        values[f["key"]] = _resolve_path(raw, f.get("path", ""))
    return values

def _prep_builtin(body: SourceInput) -> dict:
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
    return {"url": body.url, "fields": [f.model_dump() for f in body.fields]}

@api_router.get("/sources")
async def list_sources(user: dict = Depends(get_current_user)):
    docs = await db.sources.find({"user_id": user["id"]}, {"last_raw": 0}).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/sources")
async def create_source(body: SourceInput, user: dict = Depends(get_current_user)):
    prep = _prep_builtin(body)
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
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
async def list_scenes(user: dict = Depends(get_current_user)):
    docs = await db.scenes.find({"user_id": user["id"]}).to_list(500)
    for d in docs:
        d.pop("_id", None)
    return docs

@api_router.post("/scenes")
async def create_scene(body: SceneInput, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "name": body.name,
        "width": body.width,
        "height": body.height,
        "background": body.background,
        "elements": body.elements,
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
    return out

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
</style></head>
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

SCENE.elements.forEach(el => {
  const p = el.props || {};
  const d = baseStyle(el);
  if (el.type === 'image'){
    if (p.src){ const img = document.createElement('img'); img.className='el-img'; img.src=p.src;
      img.style.objectFit = (el.style&&el.style.objectFit)||'contain'; d.appendChild(img);} 
  } else if (el.type === 'clock'){
    d.textContent = fmtClock(p.timezone, p.format);
    clocks.push({d, p});
  } else if (el.type === 'timed_text'){
    const wrap = document.createElement('div'); wrap.style.display='flex'; wrap.style.flexDirection = p.imagePosition==='top'?'column':'row';
    wrap.style.alignItems='center'; wrap.style.gap='16px'; wrap.style.width='100%'; wrap.style.height='100%';
    if (p.image){ const im=document.createElement('img'); im.src=p.image; im.style.objectFit='cover';
      im.style.height = p.imagePosition==='top'?'60%':'100%'; im.style.borderRadius='12px'; wrap.appendChild(im);}    
    const txt=document.createElement('div'); txt.textContent=p.text||''; txt.style.flex='1'; wrap.appendChild(txt);
    d.appendChild(wrap);
    timeds.push({d, p});
  } else if (el.type === 'api_field'){
    d.textContent = (p.prefix||'') + '…' + (p.suffix||'');
    apiEls.push({d, p});
  } else { // text
    d.textContent = p.text || '';
  }
  stage.appendChild(d);
});

function tick(){
  clocks.forEach(c => c.d.textContent = fmtClock(c.p.timezone, c.p.format));
  timeds.forEach(t => {
    const s = toMin(t.p.start), e = toMin(t.p.end);
    let vis = true;
    if (s != null && e != null){ const n = nowMinutes(t.p.timezone);
      vis = s <= e ? (n >= s && n <= e) : (n >= s || n <= e); }
    t.d.style.display = vis ? 'flex' : 'none';
  });
}
setInterval(tick, 1000); tick();

async function poll(){
  if (!apiEls.length) return;
  try{
    const r = await fetch(BACKEND + '/api/public/scene/' + TOKEN + '/values.json');
    const data = await r.json();
    apiEls.forEach(a => {
      const key = a.p.sourceId + ':' + a.p.fieldKey;
      let v = data[key];
      if (v == null) v = '';
      a.d.textContent = (a.p.prefix||'') + v + (a.p.suffix||'');
    });
  }catch(e){}
}
setInterval(poll, 5000); poll();
</script>
</body></html>"""

@api_router.get("/public/scene/{token}/values.json")
async def public_values(token: str):
    """Raw source values keyed by sourceId:fieldKey for overlay polling."""
    scene = await _get_public_scene(token)
    out: Dict[str, Any] = {}
    cache: Dict[str, Dict[str, Any]] = {}
    for el in scene.get("elements", []):
        if el.get("type") != "api_field":
            continue
        p = el.get("props", {})
        sid = p.get("sourceId")
        if sid and sid not in cache:
            src = await db.sources.find_one({"id": sid})
            cache[sid] = await resolve_source_values(src) if src else {}
        out[f"{sid}:{p.get('fieldKey')}"] = cache.get(sid, {}).get(p.get("fieldKey"), "")
    return JSONResponse(out)

@api_router.get("/")
async def root():
    return {"message": "vMix Overlay Studio API"}

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.sources.create_index("user_id")
    await db.scenes.create_index("public_token", unique=True)
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

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000"), "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
