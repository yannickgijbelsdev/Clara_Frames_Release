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

## Implemented (iter 5, 2026-06)
- Background fit options per scene: Fill (cover) / Fit (contain) / Repeat (tile), for image and video backgrounds.
- Dim overlay: pick an overlay color + opacity that tints the background media (below elements) in editor, preview and vMix overlay.
- Element animation presets on any element (incl. SVG logos): pulse, fade, spin, bounce, float, blink, slide + adjustable speed; CSS keyframes shared by editor canvas and the vMix overlay HTML (applied on an inner wrapper so rotation still works).
- Verified: iter5 5/5 backend tests + full UI wiring pass.

## Implemented (iter 6, 2026-06)
- Media Library: every S3 upload is tracked (db.media); /media page shows all uploads with preview, size, Copy URL and Delete (removes S3 object + record).
- Reuse picker: the upload control now has a Library button that opens a dialog to pick an existing upload (videos filtered out for image-only fields); used in scene image, timed-text photo, scene background and settings avatar.
- 'Media' nav item added.
- Verified: iter6 5/5 backend tests + full UI wiring pass.

## Implemented (iter 7, 2026-06)
- Entrance (one-shot) animations per element: fade / slide-up / slide-down / slide-left / slide-right / zoom, with adjustable duration + delay; independent from the continuous animation (separate wrappers). timed_text replays its entrance each time it enters the visible window in the vMix overlay.
- Media Library search + filter (All / Photos / Videos) with live counts.
- Verified: iter7 3/3 backend tests + full UI wiring pass.

## Implemented (iter 8, 2026-06)
- Flow Builder — timed rotating "pancartes": a scene can hold FLOWS; each flow is a positioned region cycling through cards (title + subtitle + optional photo), N seconds per card, with an entrance animation.
- Flow scheduling: 'Always on' (cycle continuously) or 'Every X minutes' (appear for N seconds each cycle, then hide) — driven client-side in the vMix overlay.
- Editor: 'Pancarte flow' toolbar button; flows are draggable/resizable on the canvas and cycle in live preview; dedicated flow panel (name, seconds/card, entrance, schedule, card+text colors, cards list with add/remove + per-card image upload).
- Verified: iter8 5/5 backend tests + full UI wiring pass.

## Implemented (iter 9, 2026-06) — Pancartes & Flows restructure
- Pancartes are now standalone, fully-designable card resources (`db.pancartes`): own canvas width/height, own background (color/image/video + fit + dim overlay) and freely-placed elements (text, image, clock, api_field, timed_text). Dedicated list `/pancartes` + editor `/pancartes/:id` (reuses SceneCanvas + shared ElementInspector). Create/duplicate/delete.
- Flows are now standalone sequences (`db.flows`): ordered `pancarte_ids`, seconds-per-pancarte `interval`, entrance transition. List `/flows` + editor `/flows/:id` with a pancarte Library (click to add), Sequence (reorder up/down, remove) and a cycling Live preview.
- Scenes now only PLACE a flow: `scene.flows[i] = {id, flow_id, x, y, w, h, schedule:{mode:'always'|'everyX', everyMinutes, showSeconds}}`. Scene editor flow panel has a 'Which flow' picker + schedule + position; canvas renders the referenced flow's pancartes (scaled, contain) and cycles them.
- Backend: CRUD `/api/pancartes[/{id}]` and `/api/flows[/{id}]` (workspace-scoped); `expand_scene_flows()` embeds resolved flow + pancarte docs into the public overlay; overlay JS rebuilt to render each pancarte design scaled into its region and cycle by interval (+ everyX schedule); `values.json` now also resolves api sources referenced inside pancartes.
- Shared frontend modules: `lib/elementDefs.js` (templates/TOOLS/FONTS), `lib/elementRender.jsx` (elBoxStyle/ElementContent/anim+entrance/BackgroundLayer), `components/PancarteView.jsx`, `components/ElementInspector.jsx`.
- Old embedded-card flow schema removed (per user: existing pancartes discarded). Verified: iter9 backend 4/4 + full frontend journey pass.

## Implemented (iter 10-11, 2026-06) — Forms & Messages + auth tweaks
- Removed the "Create one" registration link from the login page (registration API left intact per user).
- Forms builder (`db.forms`): any logged-in user builds a form with custom fields (label, auto-slug key, type text/email/number/tel/textarea/select/checkbox, required toggle, and a "Show in Messages list" toggle). List `/forms` + editor `/forms/:id`. Public integration: GET `/api/public/form/{token}` returns the field schema, POST `/api/public/form/{token}/submit` accepts answers (required-field validation, stores submission). `PublicFormCORSMiddleware` opens CORS (ACAO:*) on `/api/public/form/*` so any external website can fetch + submit.
- Messages inbox (`db.submissions`): `/messages` lists submitted answers newest-first; only fields with showInList appear directly, the rest are behind a per-message "More details" button; mark read / delete; form filter dropdown. Unread counter badge on the Messages nav item (polls `/submissions/unread-count`, plus live refresh via a `submissions-changed` window event after read/delete).
- Permanent admin seeded at startup: yannick.gijbels@koodh.com / KYLovie13monx (role admin, create-if-missing, mfa_enabled=false so first login forces the user's own MFA setup via QR).
- Verified: iter10 backend 8/8 + full frontend pass; auth seeding verified via curl + DB (role=admin, $2b$ bcrypt, mfa_setup on first login). Fixed 2 minor UX items (new-field auto-slug, live badge update).

## Known follow-ups (code review, non-blocking)
- Pancarte/Flow delete is immediate (no confirm dialog) — matches existing Scenes behaviour.
- FlowEditor/SceneEditor duplicate flow/pancarte fetch + cycling logic; could extract a useFlowCycle hook.
- expand_scene_flows runs only in public_overlay (private GET /scenes/{id} does not embed _flow/_pancartes; frontend fetches flows+pancartes separately).
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
