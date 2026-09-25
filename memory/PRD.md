# Overlay Studio — vMix Overlay Designer (PRD)

## Original problem statement
Platform met MFA-login. Doel: API's/overlays maken die in vMix ingeladen worden (logo, klok, getimede tekst met foto). API sources van bestaande API's toevoegen om info te tonen. Ontwerp een scene op een 16:9 canvas (zoals vMix GT Designer) met beelden/teksten en exporteer als één enkele bron voor vMix. Design: Clara Campaigns light-thema.

## User choices
- MFA: TOTP authenticator-app + email/wachtwoord
- vMix: Data Source (XML/JSON) + Web Browser overlay-URL
- API sources: vaste voorbeelden (weer, wereldklok) + eigen URL's
- Design: Clara Campaigns light-thema (Outfit / Plus Jakarta Sans, rose/periwinkle)
- Editor: drag & drop op 16:9 canvas

## Architecture
- Backend: FastAPI (/api), MongoDB (motor). JWT via httpOnly cookies + TOTP MFA (pyotp, qrcode).
- Frontend: React 19, react-router, framer-motion, shadcn/ui, Tailwind (Clara tokens).
- Collections: users, sources, scenes.

## Core requirements (static)
- MFA-protected auth (register -> QR setup -> verify; login -> password -> TOTP code).
- Scene editor with element types: text, clock, image/logo, timed_text (+photo, schedule), api_field.
- API sources: builtin_weather (open-meteo), builtin_time, custom (URL + JSON-path field mapping + refresh interval), test fetch.
- Public token endpoints for vMix: overlay (live HTML), data.json, data.xml, values.json, settings download; token regeneration.

## Implemented (2026-06)
- Full MFA auth (email/password + TOTP), admin seeded (admin@example.com / admin123, secret JBSWY3DPEHPK3PXP).
- Sources CRUD + test; Scenes CRUD; drag/resize 16:9 canvas editor with per-element property panel.
- Export page with copyable vMix URLs + downloadable settings file; live preview.
- Clara Frames app shell (koodh-beak periwinkle logo, left-aligned nav, animated dark pill, periwinkle buttons, top loading bar).
- Verified: iter1 29/29 backend + full frontend pass.

## Implemented (iter 2, 2026-06)
- Fixed editor click-deselect bug (clicking an element keeps the properties panel open).
- Per-element vMix outputs: GET /api/public/scene/{token}/element/{id}.txt and .json (live text per element); shown in editor panel + Export page.
- Account Settings page: change password, avatar (URL/color presets), 2FA reset (QR + confirm), backup codes (generate/regenerate); login accepts single-use backup codes.
- User management (admin): list/create/update-role/delete users; guards against deleting/demoting the last admin.
- Multiple environments (workspaces): header switcher, create/switch; scenes & sources scoped by workspace_id; cascade delete.
- Cleaner dashboard (big stat card + metrics pill + searchable recent-scenes card).
- Recolored theme rose→periwinkle (brand palette); login bears background + divider; new login subtitle.
- Verified: iter2 53/53 backend + full frontend pass.

## Implemented (iter 3, 2026-06)
- Image/file uploads to the user's own Hetzner S3 (endpoint nbg1.your-objectstorage.com, bucket koodh-clara, region eu-central, public-read) via boto3; POST /api/uploads returns a public URL.
- Reusable ImageUpload component (URL field + Upload button + preview) wired into: scene image/logo element, timed-text photo, and Settings avatar.
- Header avatar refreshes after profile save; client-side 10MB size guard.
- Verified: iter3 5/5 upload backend tests + full UI upload wiring pass (public URL fetch HTTP 200).

## Implemented (iter 4, 2026-06)
- Video/GIF moving backgrounds per scene: uploads accept video/mp4|webm|quicktime|ogg (max 50MB) alongside images; scene.background = {color, type:'color'|'image'|'video', src}.
- Background media renders full-bleed (looping muted video / image) behind elements in the editor canvas, live preview, and the vMix overlay HTML.
- ImageUpload extended with accept + maxMB props and inline video preview.
- Verified: iter4 9/9 video-background tests + full UI wiring pass.

## Known follow-ups (code review, non-blocking)
- Upload reads full file into memory before size check; consider streaming/max_upload_size.
- Content-type trusted from client header (no magic-byte sniffing).
- No cleanup of orphaned S3 objects when media is replaced/cleared.
- Media type detection is extension-based (URL without known ext defaults to image).

## Backlog / next
- P1: Image/photo upload (object storage) instead of URL-only.
- P1: Require re-auth (current password/TOTP) before 2FA reset.
- P2: Per-column timezone/format for clock in data.json.
- P2: Brute-force lockout on login/mfa endpoints.
- P2: Cache-Control/ETag on per-element output endpoints (polled every 1s by vMix).
