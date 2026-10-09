# Clara Frames — vMix Overlay Platform (PRD)

## Original problem statement
Platform met MFA-login dat API's levert voor vMix (video software) om overlays te tonen: logo, klok, getimede tekst met foto, enz. Design volgt de Clara Campaigns LAYOUT MVP. UI in het Engels, communicatie met gebruiker in het Nederlands.

## Core requirements
- MFA Auth (TOTP, mandatory).
- 16:9 drag & drop scene editor (vMix GT Designer-stijl) met layer ordering.
- Elementen: Text, Clocks, Images, Videos, HTML Overlays, API sources, Ticker-bars.
- vMix export / API output per element, met auto-sync / live polling.
- Media Library (upload naar Hetzner S3).
- Sequence-architectuur (Overlays & Sequences), timed schedules + countdowns, Timeline-pagina.
- Forms builder, iTunes integratie.
- Live data rendering in previews.
- Timeline stream monitoring (HLS + Vimeo) met audio-meters.

## Terminology
- "Overlays" = individuele designs (DB/model: `pancartes`).
- "Sequences" = geordende lijsten (DB/model: `flows`).

## Architecture
- Frontend: React + Tailwind + shadcn/ui, hls.js, Web Audio API. Auth via cookies.
- Backend: FastAPI + PyMongo (PyObjectId), `requests.Session` voor resiliente scraping.
- Auth: custom JWT + mandatory TOTP (PyOTP), two-step login (password -> mfa/verify).

## Credentials (test)
Zie /app/memory/test_credentials.md.

## Recently implemented
- 2026-06: VU-meter vervangen door simpele vMix-stijl meter — twee kale verticale balken in Clara Frames blauw (#5f6da6), rood piektopje, geen omkadering. (`VUMeter.jsx`, `StreamMonitor.jsx`) — VERIFIED (screenshot).
- Analoge VU-meter + audio routing voor muted HLS streams (vervangen door bovenstaande).
- HLS/Vimeo stream monitoring in Timeline, view switcher, enable-audio.
- Multiple sequences per scene, duplicate/rename sequences & scenes.
- Permanente API-source fix (requests.Session, retries, timeouts).
- Auto-save (1s debounce) over Overlay/Sequence/Scene editors.
- Live mini-previews per scene in Timeline, trigger-now & stop/interrupt sequences.

## Backlog
- P0: Refactor `/app/backend/server.py` (>2600 regels) naar modulaire routers (auth, scenes, media, forms, streams).
- P1: WebSockets/SSE voor real-time overlay updates (nu polling).
- P2: Email alert bij nieuwe form submission.
- P2: Export messages als CSV.
- P2: Embed-snippet (iframe) voor forms.
- P2: Top-list overzicht (meest aangevraagde songs per form).

## Key files
- Backend: `/app/backend/server.py`
- Frontend components: `VUMeter.jsx`, `StreamMonitor.jsx`, `PancarteView.jsx`, `SceneCanvas`, `AppLayout.jsx`
- Pages: `Login`, `Scenes`, `SceneEditor`, `Overlays`, `Flows`, `Timeline`, `Sources`
- Lib: `elementDefs.js`, `elementRender.jsx`, `schedule.js`, `useAutoSave.jsx`
