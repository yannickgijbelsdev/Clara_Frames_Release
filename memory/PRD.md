# Overlay Studio — vMix Overlay Designer (PRD)

## Original problem statement
Platform met MFA-login. Doel: API's/overlays maken die in vMix ingeladen worden (logo, klok, getimede tekst met foto). API sources van bestaande API's toevoegen om info te tonen. Ontwerp een scene op een 16:9 canvas (zoals vMix GT Designer) met beelden/teksten en exporteer als één enkele bron voor vMix. Design: Clara Campaigns light-thema.

## User choices
- MFA: TOTP authenticator-app + email/wachtwoord
- vMix: Data Source (XML/JSON) + Web Browser overlay-URL
- API sources: vaste voorbeelden (weer, wereldklok) + eigen URL's
- Design: Clara Campaigns light-thema (Outfit / Plus Jakarta Sans, rose/periwinkle)
- Editor: drag & drop op 16:9 canvas

## 2026-10-06h — Ticker: choose which form fields show
- Ticker element gained props.fields (array of form field keys). Empty = all fields; otherwise only those fields, in the tapped order.
- Backend: _submission_ticker_text(form, data, keys) + _ticker_items_for_form(form, keys); endpoints GET /forms/{fid}/ticker-items and GET /public/scene/{token}/ticker/{form_id} accept ?fields=key1,key2. Overlay JS + editor Ticker append ?fields=.
- Inspector: when a form is chosen, a "Fields to show" chip row (data-testid ticker-fields, ticker-field-{key}) toggles props.fields.
- Verified via curl: all→"Jan · Amy Winehouse - Rehab", fields=name→"Jan", fields=song,name→order respected.


## 2026-10-06g — Image-drag fix + Ticker bar + Messages "Live" toggle (tested iter17)
- FIX: image elements were hard to move (native image drag hijacked the pointer). elementRender.jsx image now renders <img draggable=false pointerEvents:none userSelect:none WebkitUserDrag:none> so the parent box handles the drag. Verified: dragging the image body moves the element exactly.
- NEW element type "ticker" (TOOLS 'Ticker bar', icon ScrollText): a full-width scrolling bar. Props: formId (messages source), freeText (scrolls along), icon (separator glyph from a set), speed (Slow/Normal/Fast). Styled via the normal font/colour/background controls. CSS keyframe clara-ticker (index.css + OVERLAY_HTML). Renders as a seamless marquee (content duplicated, translateX -50%).
- Ticker content = freeText + live messages of the chosen form, joined by the chosen icon. Editor Ticker fetches GET /api/forms/{fid}/ticker-items every 10s; overlay fetches GET /api/public/scene/{token}/ticker/{form_id} every 10s.
- Messages: per-message "Live" toggle (data-testid message-ticker-{sid}) → POST /api/submissions/{sid}/ticker {on}; only ticker=true submissions appear in the ticker. Backend helper _submission_ticker_text joins a submission's non-empty field values (song_pick -> "Artist - Title").
- Editors (Scene + Pancarte) now also load /forms and pass `forms` to ElementInspector.
- Redeploy needed for live site.


## 2026-10-06f — Corner radius control for images & overlays
- ElementInspector gained a RoundingControl (data-testid prop-radius slider + radius-square/radius-rounded/radius-circle buttons) for image and overlay elements. Writes style.borderRadius; max = half the smaller dimension so "Circle" makes a square image a perfect circle.
- Rendering already clipped via elBoxStyle (overflow:hidden + borderRadius) in editor/PancarteView AND the vMix overlay box (d.style.borderRadius + overflow hidden), so rounding carries through to vMix output.
- Verified via UI: album cover rounded to a circle (computed border-radius 260px on a 520px box).


## 2026-10-06e — One-click "Now Playing" pancarte template
- Pancartes page: new "Now Playing template" button (data-testid np-template-btn). Finds the workspace's builtin_nowplaying source and creates a 1920x1080 pancarte pre-wired: album cover image (bound to artwork), "NOW PLAYING" label, artist api_field (bold Outfit), title api_field (lighter Jakarta), then opens it in the editor. If no now-playing source exists it toasts to create one first.
- Verified via UI: clicking created a pancarte showing live cover + "Creedence Clearwater Revival" / "Bad Moon Rising" from the GRK source; layers title/artist/label/cover present. Artist font tuned to 76px + lineHeight for long names.


## 2026-10-06d — "Now Playing (radio)" smart source (split artist/title + album cover)
- New source type builtin_nowplaying: reads a radio now-playing URL (JSON like …/now-playing with song_title, OR a plain …/now-playing.txt) and exposes SEPARATE fields: artist, title, song (full), artwork.
- Splits the song string on a configurable separator (default " - "); optional reverse for "Title - Artist". JSON song field auto-detected (song_title/raw_song_title/original_song_title/title/np...) or set via song_path.
- Album cover fetched automatically via iTunes (_itunes_artwork, 600x600), cached per song string on the source doc (np_cache) so iTunes is only queried when the song changes.
- Backend: SourceInput gained song_path/separator/artwork/reverse; _prep_builtin + create/update persist them; resolve_source_values has a builtin_nowplaying branch (after fetch). NOWPLAYING_FIELDS drive the field list + api_field/image binding dropdowns.
- Frontend: Sources dialog has a builtin_nowplaying section (URL, separator, refresh, optional JSON song field, reverse checkbox, auto-artwork checkbox). TYPE_META label "Now Playing (radio)".
- USAGE: place an api_field bound to `artist` and another to `title` (each element keeps its own bold/font/size/color/align via ElementInspector), and an image element bound to `artwork`. Styling-per-element already existed.
- Verified e2e (curl): JSON + .txt both return artist/title/song + hi-res artwork. Redeploy needed for live site.


## 2026-10-06c — FIX: API values now shown live in the editor
- Bug: in the Scene/Pancarte editor an api_field showed only "…" and source-bound images stayed static, so users thought their API wasn't loading ("API's worden niet getoond"). Cause: the editors never fetched resolved source values; SceneCanvas received no sourceValues.
- Fix: new backend GET /api/sources/values?workspace_id=... resolves every workspace source to a {"sourceId:fieldKey": value} map (skips internal _keys). SceneEditor & PancarteEditor fetch it on load + every 15s and pass sourceValues to SceneCanvas; FlowRegion forwards sourceValues to PancarteView so pancarte api_fields/images inside flows also show live data.
- Verified: api_field rendered "♪ Charlie Puth - Attention" live on canvas; /sources/values returns plain-text (now-playing, live-station) correctly.
- NOTE for JSON APIs (e.g. /api/public/schedule/.../today returns {shows:[...]}): plain-text default 'text' field resolves to null — user must map a field path (e.g. shows.0.title). Plain-text endpoints (now-playing.txt, live) work out of the box via the auto 'text' field.


## 2026-10-06b — Canvas timeline preview for timed flows
- SceneCanvas FlowRegion now PLAYS the full timed sequence in the editor canvas (not just a text summary): intro overlay (leadSeconds) → each pancarte (flow.interval) → end overlay (seconds) → short gap → loop. Continuous 'always' mode still cycles pancartes.
- Uses a compact PREVIEW_GAP (1.5s) between cycles so designers see the sequence quickly; a phase badge (data-testid flow-phase-{placementId}) shows Intro / Pancarte i/N / End. Overlays rendered via OverlaySurface (iframe/video/img, pointer-events none).
- Verified via screenshot: phase advanced INTRO → PANCARTE 1/2 → PANCARTE 2/2 → END → (gap) → loop. Redeploy needed for live site.


## 2026-10-06 — Timed pancarte flows (intro/outro overlays + auto-close)
- Scene flow placements now support a TIMED mode that plays the pancarte series ONCE then auto-closes (no longer a fixed showSeconds window). Per-pancarte seconds = flow.interval; series duration = count × interval.
- Each timed placement can have an INTRO overlay (from the Overlays library) that starts N seconds BEFORE the pancartes (schedule.intro = {overlayId,url,kind,fit,leadSeconds}) and an END/outro overlay shown for M seconds AFTER the series (schedule.outro = {overlayId,url,kind,fit,seconds}).
- Timeline per cycle (everyMinutes): [intro leadSeconds] → [pancartes ×interval, once] → [outro seconds] → hidden until next cycle. Implemented in OVERLAY_HTML (buildOverlayNode, showTimedPart, phase-based tick); continuous 'always' mode unchanged.
- Editor: SceneEditor flow panel rebuilt — mode select (Always / Timed), Appear every (min), Intro overlay + 'starts … sec before', End overlay + 'show for … sec', and a live timeline summary (data-testid flow-timeline-summary, flow-intro-overlay, flow-outro-overlay, flow-intro-lead, flow-outro-seconds). Uses the workspace overlays list.
- Verified e2e: overlay HTML embeds intro/outro + timing logic (no JS errors); browser render caught the INTRO phase; flow panel + summary verified via screenshot. Redeploy needed for live site.


## 2026-10-05 — Overlays (uploadable HTML/video/image overlays)
- New nav item "Overlays" (/overlays, page /app/frontend/src/pages/Overlays.jsx), workspace-scoped library: upload + preview (HTML in transparent iframe, video, image) + copy URL + delete.
- Backend: collection `overlays`; POST /api/overlays/upload (multipart file + workspace_id form field) -> S3 (overlays/{uid}/..), HTML stored with ContentType text/html; GET /api/overlays?workspace_id; DELETE /api/overlays/{id}. Kinds: html (.html/.htm, max 5MB), video (mp4/webm/mov, max 50MB), image (png/jpg/webp/gif, max 10MB). Needs `Form` import from fastapi.
- New element type "overlay" (elementDefs templates + TOOLS 'Overlay (HTML/video)', icon MonitorPlay). Props: {name, overlayId, url, kind}; style.objectFit for video/image. Usable in BOTH Scene & Pancarte editors; appears as a layer in the Layers panel.
- Rendering: ElementContent (elementRender.jsx) + backend OVERLAY_HTML buildElementNode render html->transparent iframe (pointerEvents none in editor), video->autoplay/loop/muted video, image->img. Verified e2e: upload html, scene render embeds iframe+url; Overlays page + editor tool/inspector/canvas verified via screenshots.
- Inspector: prop-overlay (choose overlay), prop-overlay-fit (non-html). Editors load /overlays and pass to ElementInspector.
- Redeploy needed for live site.


## 2026-10-03 — "Nu Speelt (live)" + Layers panel
- LIVE NOW-PLAYING: per-workspace `builtin_live` source (auto-created). Fields: text ("Artist - Title"), title, artist, artwork. Endpoints: GET/POST/DELETE /api/sources/live (?workspace_id). One active song; new replaces previous; DELETE clears. Messages inbox: a "Live" button per song (song-live-{i}) sets it live; a top banner (live-now-banner) shows the current live song with a "Wis" button (live-clear-btn).
- IMAGE BINDING: image elements can bind to a source field (props.sourceId + fieldKey, e.g. artwork). Overlay JS (imageApis/updateImages) + build_scene_data + values.json now resolve image bindings so artwork updates live. Inspector: prop-img-source + prop-img-field.
- LAYERS PANEL (/app/frontend/src/components/LayersPanel.jsx): added to Scene & Pancarte editors (left column). Lists elements (front-first, "top = front"), click row to select, eye toggle visibility (el.hidden), trash to delete, drag grip to reorder (z-index). Hidden elements skipped in overlay HTML + PancarteView + canvas preview (dimmed in editor). Note: build_scene_data does NOT skip hidden (vMix column stability).
- Tested iter16: backend 9/9, frontend 100%, no issues.
- NEXT (Phase 2, requested): Regie/Control page — rebuild existing page into an operator surface with live overlay preview + rundown + one-click "Set Live" per overlay (English), editable Variables (title/subtitle/image) before going live, designed to run 24/7. Needs a live-channel mechanism to push a chosen pancarte into the running scene output.


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

## Implemented (iter 12, 2026-06) — Song-pick form field
- New form field type `song_pick`: visitors pick songs live from the iTunes catalog (search by title/artist) with cover art + ~30s audio preview. Per field the admin chooses "1 song" or "Top 5 (ranked, order preserved)".
- Backend: public iTunes proxy `GET /api/public/itunes/search?term=&limit=` -> [{id,title,artist,album,artwork(200x200),preview}]; public form schema now returns `song_search_url` + per-field `max`/`mode`; submit caps song arrays to max (order kept); PublicFormCORSMiddleware broadened to all `/api/public/*`.
- Frontend: reusable `SongPicker` (search/select/reorder/play) used as an inline preview in FormEditor; `SongList` renders chosen songs (cover + title + artist + play) in Messages.
- Website integration panel simplified to ONE prominent API URL (the schema GET) whose response contains fields + submit_url + song_search_url + honeypot_field — one URL to share with any site / Emergent project.
- Also: renamed old "vMix Overlay Studio" strings (TOTP issuer -> Clara Frames earlier; root API message -> Clara Frames API). Removed all Emergent assets/tracking from the frontend (index.html PostHog+badge+meta; koodh logo/login-bg now local imports; deleted unused constants).
- Verified: iter12 backend 7/7 + full frontend flow pass (no defects).

## Implemented (iter 13, 2026-06) — Hosted form page + song fix
- Root cause of "song not in Messages / no play+add buttons": the user built their own site from the raw JSON API, which can't render interactive controls.
- NEW hosted, embeddable form page at `/f/{public_token}` (public, no auth): renders the full working form for every field type incl. the `song_pick` picker (iTunes search -> results each with a play-preview button + a "+" add button; selected songs shown ranked with cover), hidden honeypot, submits to the form, success screen. Link it or iframe it.
- Schema now self-describes `song_pick` fields with `search_url` + `result_fields`; FormEditor integration panel surfaces the ready-to-use form page URL (copy-formpage-url) alongside the API URL.
- Messages renders submitted songs as cover + title + artist + play (SongList). Verified iter13: backend 5/5 + frontend 100%, no defects.

## Fixed (iter 14, 2026-06) — song_pick robustness (live-site empty song)
- Symptom: a user's self-built external form posted song_pick answers but the song showed empty ("—") in Messages (text fields worked). Production DB not inspectable from preview (deployer RCA blocked by a platform deploy-scoping error: "v3 deployment not found" for the job id).
- Root causes addressed defensively: integrator may send the song as a JSON-stringified array, a single object, or raw iTunes-keyed objects (trackName/artistName/artworkUrl100/previewUrl).
- Fix: backend `public_submit_form` normalizes song_pick values to a clean array (parse JSON string, wrap single dict, cap to max) before the required check; frontend `SongList.normSong()` maps both our keys and raw iTunes keys; Messages `toSongs()` coerces string/object to array. Verified iter14 backend 4/4 + frontend 100%.
- REMAINING user action: the fix must be REDEPLOYED to take effect on the live site; and if still empty after redeploy, it's a field-key mismatch (POST must use the field's exact `key`; unknown keys appear under Messages "More details").

## Fixed (iter 15, 2026-06) — public form checkbox not checkable
- Symptom: a checkbox field on the hosted public form (/f/{token}) could not be checked.
- Root cause: it rendered as a radix Switch wrapped INSIDE a <label> -> a real tap double-toggled (label htmlFor click + control click) = net no change.
- Fix: replaced with a real radix Checkbox at data-testid pf-{key} + a SIBLING <label htmlFor=pf-{key}> (top Label suppressed for checkbox to avoid duplicate). Single toggle; checked/unchecked persists as Yes/No in Messages. Verified iter15 backend 9/9 + frontend 100%.
- Needs REDEPLOY to take effect on the live site; self-built external forms must POST the checkbox as a boolean under the field key.

## 2026-10-02 — Plain-text API sources (now-playing.txt) fix
- Symptom: a plain-text API source (e.g. https://clr.koodh.com/api/rds/grk/now-playing.txt) tested OK but the API-field element stayed EMPTY in scene/overlay.
- Root cause: non-JSON responses are wrapped as {"_text": ...}; with no field mapping the source exposed no fields, so the api_field element had nothing to bind to.
- Fix (backend server.py): (1) _prep_builtin auto-creates field {key:"text", path:"_text"} when a custom source has no mapping; (2) resolve_source_values skips blank-key fields and always exposes "text" for {"_text":...} responses (safety net for existing sources).
- Fix (frontend): ElementInspector field dropdown filters blank keys and falls back to a selectable "text" option; Sources.jsx hint tells users to leave mappings empty for plain-text APIs.
- Verified e2e in preview: source test, /values.json, /element/{id}.txt and /data.json all return the live song. NEEDS REDEPLOY for the live site.

## 2026-06 — Now-Playing source fetch 404 fix (redirect + User-Agent)
- Symptom: Test on a Now-Playing (radio) source `http://clr.koodh.com/api/rds/grk/now-playing.txt` returned "404 Client Error" though the URL works in a browser.
- Root cause: the `http://` URL 301-redirects to `https://`; older/production fetch + the default `python-requests` User-Agent (some servers block it). 
- Fix: `_fetch_source_sync` now sends a browser `User-Agent` + `Accept`, and sets `allow_redirects=True` explicitly.
- Verified (preview): `/sources/{id}/test` on that exact URL returns song/artist/title + iTunes artwork. User must REDEPLOY (they saw the 404 from un-redeployed production); as an immediate workaround they can enter the `https://` URL directly to skip the redirect.

## 2026-06 — Custom fonts not showing in vMix (CORS) — FIXED
- Symptom: uploaded fonts did not apply in the vMix overlay.
- Root cause: overlay `@font-face` src pointed at the raw Hetzner S3 URL, which returns NO `Access-Control-Allow-Origin` header → cross-origin font load blocked in the overlay/vMix browser → fallback font.
- Fix: new public same-origin proxy `GET /api/public/font/{font_id}` streams the font bytes with `Access-Control-Allow-Origin: *`. Both `_font_faces_css(fonts, backend)` (overlay) and `injectFontFaces` (editor, `/lib/fonts.js`) now build `src` from `{backend}/api/public/font/{id}`.
- Verified by testing_agent (iteration_20): 100% backend + frontend — proxy returns ACAO:*, overlay HTML has zero raw objectstorage refs, `document.fonts.check("'BebasNeue'")` true and renders correctly, Fonts page + editor picker render the custom font.

## 2026-06 — Responsive top nav ("More" overflow dropdown)
- Problem: with 11-12 nav items the desktop menu overflowed and pushed content off-screen.
- Fix: new `DesktopNav` in AppLayout measures available width (hidden measuring nav + ResizeObserver) and renders only the items that fit; the rest move into a **"More ▾"** DropdownMenu (`data-testid nav-more`, items `nav-more-<label>`). Overflow button highlights when an overflow route is active. Mobile scroll-nav unchanged.
- Verified by testing_agent (iteration_19): 100% frontend pass — no horizontal overflow at 1920/1536/1366/1280/390, account-menu always visible, More dropdown appears and navigates correctly.

## 2026-06 — Custom font upload
- New **Fonts** page (nav + /fonts route): upload .ttf/.otf/.woff/.woff2 (≤10MB) to Hetzner S3, list with a live preview, delete. Backend: `db.fonts` + POST /fonts/upload, GET /fonts, DELETE /fonts/{id}; family name auto-derived from filename.
- Uploaded fonts appear in every text element's **Font** picker (ElementInspector gets `customFonts`; value = `'<family>', sans-serif`), under a "Your fonts" group. Editors inject `@font-face` into the document (`/lib/fonts.js injectFontFaces`) so previews render.
- Overlay: `public_overlay` fetches the scene workspace's fonts and injects `@font-face` CSS via `__FONTFACES__` placeholder → vMix renders custom fonts.
- Verified end-to-end: uploaded BebasNeue, listed with preview, appeared in picker, and `@font-face` injected into a same-workspace scene's overlay.

## 2026-06 — Exit animations + timing for every element
- **Exit animation per element**: new `props.exit` (none/fade/slide-up/down/left/right/zoom) + `props.exitDuration`. Plays when the element leaves via timing (interval end or onchange window end). Overlay JS: `exitAnim()` + `clara-ex-*` keyframes; `setElVis` plays the exit anim then sets display:none after the duration, and on re-show resets the animation (clears the `both`-fill leftover so opacity returns to 1). ElementInspector: "Exit (plays when it leaves)" section (all elements).
- **Timing for all element types**: removed the api_field/image/overlay restriction on the "On-screen timing" section — interval and onchange are now selectable for every element (still gated by `allowTiming`, i.e. only in the Scene editor).
- Verified live: element shows at opacity 1 for the window, fades out (opacity 0.77→hidden) at the end, resets to opacity 1 for the next trigger.

## 2026-06 — Link any element (image/overlay background) to a now-playing trigger
- Extended per-element "On-screen timing" to the **overlay** element type (was api_field/image only) and added a **Trigger source + field** picker for `onchange` mode. This lets a STATIC background image or an uploaded overlay (no data binding of its own) be linked to a source field (e.g. Nu Speelt `title`) so it only appears when that field changes — i.e. only on a new song — for the configured seconds, then hides.
- Backend: `timedEl.key` for onchange = `timing.triggerSource:triggerField` (fallback to the element's own `sourceId:fieldKey`). `values.json` now also resolves any element's `timing.triggerSource/triggerField` so the trigger value is polled even when no element is bound to it.
- Frontend ElementInspector: `onchange` shows `el-trigger-source` + `el-trigger-field` selects; `allowTiming` now also covers overlay elements.
- Now-Playing template untouched (user builds it as loose elements).
- Verified live: a static image linked to Nu Speelt `title` shows ~4s on load, hides, and re-appears when the song changes to a new title (poll-driven).

## 2026-06 — Ticker fixes + per-element on-screen timing
- **Ticker raw chars fixed**: separator used `\\u00A0`/`\\u25CF` (double backslash in the raw Python overlay string) → vMix showed literal `\u00A0●`. Changed to single-backslash `\u00A0`/`\u25CF` so it renders as " ● ".
- **Ticker bar too thick fixed**: ticker `inner` was `display:block`, so the text sat at the TOP of the bar leaving empty dark space below. Changed to `display:flex; align-items:center` (track `flex:0 0 auto`) → text vertically centered, bar hugs it.
- **Per-element on-screen timing** (scene api_field & image only): new `el.timing = { mode, showSeconds, gap, gapUnit }`. Modes: `always` (default), `interval` (clock-aligned: show `showSeconds`, hide `gap` sec/min/hour, repeat), `onchange` (show `showSeconds` whenever the bound value changes, e.g. a new Now-Playing song, then hide). Overlay JS: `timedEls` + `setElVis`/`elGapSeconds`; interval uses `secOfDay % (show+gap)`, onchange tracks `_lastVal`/`_showUntil` against `lastValues`. ElementInspector gains an "On-screen timing" section (gated by `allowTiming`, passed only from SceneEditor). Now-Playing template is unchanged — user builds it as loose API elements and sets onchange.
- **Pancarte overlap** kept as-is (user confirmed). Their vMix complaint was the un-redeployed production still running old timing.
- Verified: ticker sep now single-backslash (curl); interval element toggles ~3s on/3s off live in the overlay; timing UI (interval+onchange) renders.

## 2026-06 — Transparent-by-default background + vMix auto-sync
- **Transparent background**: scene background is now mode-based (`background.mode`: transparent | color | media | stream). Overlay JS only paints a color when mode==='color', renders media when 'media', stream when 'stream' — otherwise fully transparent (default). Existing scenes with legacy `{color:...}` (no mode/type) now derive to transparent. SceneInput default → `{mode:'transparent'}`. SceneEditor: a Background mode Select (bg-mode) replaces the always-on color picker; editor canvas shows a transparency checkerboard when not a solid color.
- **Auto-sync to vMix**: overlay response now sends `Cache-Control: no-store`; overlay JS polls `/api/public/scene/{token}/version` every 4s and `location.reload()`s when `updated_at` changes — so saving a scene updates the vMix Web Browser input without a manual refresh. New endpoint GET /api/public/scene/{token}/version.
- Verified via curl (no-cache headers, BGMODE logic, version endpoint) + screenshot (checkerboard + mode selector color/stream).

## 2026-06 — Scenes/Messages batch (5 features)
- **Overlay in/out overlap**: timed pancarte-flow intro/outro overlays now CROSSFADE over the pancarte series (lie on top, no separate added time). Overlay JS everyX branch: series visible whole `showSeconds`, intro visible first `intro.leadSeconds`, outro visible last `outro.seconds`. SceneEditor labels → "(overlaps start)/(overlaps end)", summary + overflow (show>=cycle) updated. SceneCanvas FlowRegion preview rewritten to match (overlays stacked on top of cycling pancartes).
- **Messages inline edit**: PUT /api/submissions/{sid} {data:{...}} (scoped by user_id, 404 if missing). Messages.jsx: Bewerk → per-field inputs (edit-field-<key>) → Opslaan/Annuleer.
- **Live view**: LiveViewDialog.jsx renders the real /api/public/scene/{token}/overlay in an iframe over a transparency checkerboard (as vMix receives it) + Herlaad/Open-in-tab. Buttons: Scenes card (live-scene-<id>) and SceneEditor header (live-view-btn, saves first).
- **Flow + pancarte on/off per scene**: placement gains `enabled` (whole flow) + `disabledPancartes[]`. expand_scene_flows filters them; overlay JS hides disabled flow (`pl.enabled===false`). SceneEditor: flow-enabled-toggle + flow-pancarte-toggle-<id> list.
- **Vimeo/HLS scene background**: background.type='stream', stream='vimeo'|'hls'. Overlay JS: vimeo background iframe / hls.js video (hls.js CDN in <head>); editor preview via StreamBackground (hls.js npm). SceneEditor: bg-stream input (auto-detects vimeo vs .m3u8). Vimeo iframes use allow='autoplay; fullscreen; encrypted-media; picture-in-picture'.
- Verified: testing_agent iteration_18 — backend 10/10, all frontend flows pass, no bugs.

## 2026-06 — API field can render as image (artwork/presenter photos)
- Problem: the "Now Playing" template binds artwork to an Image element (works), but manually users add an "API field" element → it rendered the image URL as text ("a URL appears"). Same for presenter photos.
- Fix: api_field now has a "Display as" option (Text | Image). In Image mode it renders the bound value as a picture with Fit + Corner radius controls.
- Files: elementDefs.js (default props.display="text"), ElementInspector.jsx (Display-as select + image controls), elementRender.jsx (editor img render), server.py overlay JS buildElementNode (api_field image → registered as imgApi, updated live via updateImages).
- Verified: editor screenshot shows the artwork <img> rendered when display=image bound to Nu Speelt artwork.

## 2026-06 — Timed flow fix (clock-aligned, explicit show duration)
- Problem: pancarte flows "kept looping" — the scene flow was in "Always on" mode, and the Timed mode derived its visible duration implicitly from pancartes×interval (confusing, and `showSeconds` was dead config).
- Fix (overlay JS in server.py everyX branch): visible window now = explicit `schedule.showSeconds`; pancartes cycle within it (`floor((phase-lead)/per) % count`); cycle phase is clock-aligned to local midnight (`secOfDay % cycle`) so it fires on fixed clock moments (12:00, 12:05, …) per the vMix machine timezone.
- Fix (SceneEditor.jsx): Timed mode now has two explicit fields — "Appear every (min)" + "Show for (sec)"; live summary uses showSeconds; added overflow warning when intro+show+outro ≥ cycle (would never close); clock-alignment hint text. Default new flow showSeconds=20.
- Verified: Python sim of the timing (shows N s each cycle then hides, reappears on the minute) + overlay HTML contains the new JS + editor UI screenshot (fields, summary, overflow warning all render).

## 2026-06 — Custom API response-type selector
- Added explicit "Response type" choice for Custom API sources: Text API (whole response → `text` field), JSON API (field mappings via json paths), Image API (response/JSON-path → `image` field for binding to an Image element).
- Backend (server.py): SourceInput gains `format` + `image_path`; `_prep_builtin` builds fields per format (text→_text, image→image_path or _text, json→mappings); create/update persist `format`/`image_path`. Legacy sources derive format on the frontend (deriveFormat).
- Frontend (Sources.jsx): new `source-format` select; mappings only shown for JSON; `source-image-path` input for Image API (optional — empty = plain-text URL response).
- Verified e2e: all 4 cases via curl + iTunes image-path resolve returns the artwork URL; UI dropdown confirmed via screenshot.

## Known follow-ups (code review, non-blocking)
- Pancarte/Flow delete is immediate (no confirm dialog) — matches existing Scenes behaviour.
- FlowEditor/SceneEditor duplicate flow/pancarte fetch + cycling logic; could extract a useFlowCycle hook.
- expand_scene_flows runs only in public_overlay (private GET /scenes/{id} does not embed _flow/_pancartes; frontend fetches flows+pancartes separately).
- Upload reads full file into memory before size check; consider streaming/max_upload_size.
- Content-type trusted from client header (no magic-byte sniffing).
- No cleanup of orphaned S3 objects when media is replaced/cleared.
- Media type detection is extension-based (URL without known ext defaults to image).

## Backlog / next
### 2026-06 — Sequence scheduling, countdown & Timeline page
- Fixed "sequence never stops": repeat `once` now plays through (incl. outro) then hides everything (`onEnd`→`hideEverything`).
- New per-sequence schedule (repeat=`schedule`): `scheduleMode` `everyMin` (clock-aligned N min) or `times` (HH:MM list); sequence starts by waiting for the next slot, plays once-through, then waits for the following slot. `interval` repeat also now uses the shared wait path.
- Countdown: `showCountdown` + `countdownLabel` render an on-screen countdown in vMix while waiting (`cdNode`, `nextStartMs`/`fmtCountdown`/`enterWait`/`tickPlacement`); plus a live "Next start" countdown in the sequence editor.
- New **Timeline** page (`/timeline`): global "Next up" (scheduled sequences sorted by next start, live countdown + next-hour mini timeline) and per-scene expandable panels listing sequences (scheduled → countdown), timed elements (interval → ON NOW/countdown, on-change → label) and linked API sources. Shared `lib/schedule.js` mirrors the server logic.
- Verified: testing agent iteration 23 — backend 6/6 (pytest), frontend 100%; fixed a LOW nested-button hydration warning in the Timeline scene header.

### 2026-06 — Real data in editor/list previews
- The inline `PancarteView` previews (Overlays list, Sequences list + sequence editor live preview & thumbnails, Scene Overview overlay thumbnails) now load live source values via `/api/sources/values` (polled every 5s) and pass them to `PancarteView`, so api_field text and bound/Now-Playing artwork images render real data instead of placeholders. Verified: a live "Bohemian Rhapsody" song + cover showed correctly in the Overlays card preview.

### 2026-06 — Koodh favicon
- Generated a centered, square favicon from the Koodh beak logo (`src/assets/koodh-beak.png`): trimmed + padded, exported to `public/favicon.ico` (16/32/48), `favicon.png` (64), `apple-touch-icon.png` (180), and 192/512 PWA icons. Added `<link rel="icon">` + apple-touch-icon in `index.html` and set `theme-color` to the brand blue (#6f7fbf). Verified all assets serve 200.

### 2026-06 — On-change + separate interval for elements
- Elements in "Show when data changes" (onchange) mode can now ALSO appear on their own interval: new `timing.alsoInterval` flag reusing `gap`/`gapUnit` + `showSeconds`. In the overlay generator the onchange branch OR-combines the trigger visibility with a clock-aligned interval window. Inspector: "Also show on an interval" toggle + interval (sec/min/hour). Verified: timing persists round-trip, overlay HTML 200 + embeds the logic. (Also translated remaining Dutch inspector strings to English.)

### 2026-06 — Sequence timing rework (fix "repeats after seconds / never plays out")
- Root cause: timing was split between the sequence (per-item seconds) and a scene-placement everyX/showSeconds schedule that ignored per-item durations and chopped playback at 20s. Timing now lives entirely on the sequence (reeks).
- New per-sequence model (FlowInput + create/update + overlay generator): `durations[]` (per-item seconds), `playouts[]` (per-item "play out" = wait for the overlay's `<video>` to end), `repeat` = loop | once | interval, `repeatEvery` (minutes for interval), and HTML `intro`/`transition`/`outro` overlays ({overlayId,url,kind,fit,seconds}). Transition plays between each overlay; intro once before; outro once after.
- Overlay HTML rewritten to a per-placement state machine: `buildSteps()` → `play()` → `onEnd()` → `start()`; `durFor()` uses per-item duration (falls back to interval); `playoutFor()` waits for `<video>` 'ended' via `waitMediaEnd()`; `restartPart()` restarts transition video/iframe. Old everyX/setIdx/showSeconds tick path removed.
- SceneEditor: the everyX "When to show / Appear every / Show for" UI replaced by a hint + "Edit sequence timing" link. FlowEditor: per-item duration with sec/min unit toggle + Play-out toggle, repeat select (+ wait minutes), and intro/transition/outro HTML pickers.
- Verified: testing agent iteration 22 — backend 12/12, frontend 100%, no bugs.


- Terminology/routes: designs are now **Overlays** (`/overlays`), timed sequences are **Reeksen** (`/reeksen`), uploaded HTML/video/image files are **Assets** (`/assets`). Nav + all page labels updated (Dutch). Backend collections (pancartes/flows/overlays) reused under the new UI names; no data loss (auto-migration by relabel).
- Each Overlay (design) now has its OWN vMix link, individually selectable in vMix: `GET /api/public/overlay/{token}/overlay` + `/version` + `/values.json` + `/ticker/{form_id}`. Tokens backfilled on `GET /api/pancartes`. Shared renderer `_render_overlay_html(scene, token, pubkind)`; OVERLAY_HTML uses `PUBKIND`/`PUBBASE` so one template serves both scene and single-overlay outputs.
- Now Playing is a selectable Overlay (one-click "Now Playing overlay" template on `/overlays`).
- Reeksen: per-item seconds per overlay (`FlowInput.durations[]`) + optional loop (`FlowInput.loop`). Overlay cycler in OVERLAY_HTML uses recursive `setTimeout`/`durFor()` honoring per-item duration and loop (backward compatible: falls back to `interval`).
- New **Scene Overview** page `/scenes/:id/overview`: combined scene iframe + scene vMix link, plus each placed reeks with every overlay's own copyable vMix link + live view. "Overview" button added in scene editor + scenes list.
- Verified: testing agent iteration 21 — backend 7/7, frontend 100%, no bugs.


- Added `fallback_artwork` to Now-Playing (radio) sources. When iTunes returns no album cover, the `artwork` field automatically uses a user-chosen image from the Media Library so overlays are never empty. Backend: `SourceInput.fallback_artwork`, `_prep_builtin`, create/update source, and `resolve_source_values` (fallback applied when iTunes empty). Frontend: `ImageUpload` field in Sources NP form (testid `np-fallback`). Verified via API + direct resolve unit test.

- [2026-06] Sequence transition overlap fix (OVERLAY_HTML `play()`): transitions no longer blank the series layer. Overlay A stays visible, the transition plays on top (z-index), and the next overlay B is pre-rendered behind at the transition midpoint (`transMidTmr`, `preRendered`/`preRenderedNode`), so B is already there when the transition clears — no gap.
- [2026-06] Source fetch https-fallback (`_fetch_source_sync`): on any failure for an `http://` URL (e.g. 404/redirect quirks on some networks like `http://clr.koodh.com/...`), it transparently retries over `https://`. Fixes recurring "fetch error on every API" where the endpoint only served data over HTTPS.
- [2026-06] Source "Test" now force-refreshes (`test_source` uses `probe={**source, last_fetched:None, last_raw:None}`): bypasses the cache so a stale `last_error` from a past failure is never returned once the upstream is reachable again. Verified via pytest (open-meteo + clr.koodh nowplaying resolve with error=null).
- [2026-06] "Trigger now" for sequences: `POST /api/flows/{fid}/trigger` stamps `manual_trigger` (ms epoch). Public `/version` endpoints (scene + overlay) now return a `triggers` map `{flow_id: ms}`; the vMix OVERLAY_HTML version-poll dispatches to `placement.triggerNow()` (each placement inits `_lastTrig` from `flow.manual_trigger`, so no stale fire on load, no page reload). Timeline page has "Now" buttons (`nextup-trigger-<id>`, `tl-seq-trigger-<id>`).
- [2026-06] Scene editor overlay preview is non-blocking + toggleable (`SceneCanvas` FlowRegion): the sequence region is `pointer-events:none` (base elements underneath always editable); a draggable labelled chip (`flow-handle-<id>`) + resize handle are the only interactive parts. New `toggle-flow-preview` button in `SceneEditor` (default OFF = clean editing; ON = realistic live preview that still never blocks).
- [2026-06 follow-up] Clean edit field: when preview is OFF **and** a sequence is not selected, FlowRegion renders fully invisible/non-interactive (no tint, no outline, no chip) so nothing covers the canvas. Added a "Sequences in scene" list (`scene-sequences-list` / `scene-seq-<placementId>`) in the SceneEditor left panel to select/position a sequence without it needing to be visible on the canvas. Verified visually in preview (screenshot): preview-off shows only base elements; preview-on shows the sequence without blocking edits.

- [2026-06 follow-up] Interrupt / stop a sequence from the Timeline: `POST /api/flows/{fid}/stop` (sets `manual_stop` ms + `paused:true`) and `POST /api/flows/{fid}/resume` (`paused:false`); `trigger` now also clears `paused`. Public `/version` endpoints return `triggers`, `stops`, `paused` maps; OVERLAY_HTML version-poll dispatches `stopNow()` (breaks off now, plays the outro, then hides — no countdown) and `setPaused()`/`resume()`. Baked `flow.paused` keeps it hidden after reload. Timeline shows "Paused" + a green "Resume" button in place of the countdown + Now/Stop when paused (`nextup-stop-<id>`, `nextup-resume-<id>`, `tl-seq-stop-<id>`, `tl-seq-resume-<id>`). Verified via authenticated screenshot (stop→Paused+Resume→resume restores).

- [2026-06 follow-up] Auto-save → auto-sync to vMix: Overlay (PancarteEditor), Scene (SceneEditor) and Sequence (FlowEditor) editors now debounce-save (~1s, silent) via `useAutoSave`/`AutoSaveBadge` (`/lib/useAutoSave.jsx`); manual Save stays. The vMix `/version` poll now returns a COMPOSITE version = newest `updated_at` across the scene + its sequences + their pancartes (`_scene_control`), and the overlay baselines on first poll (`_ver=''`), so editing a pancarte/sequence/scene auto-reloads the live overlay without clicking Save. Verified: pancarte edit bumps scene version.
- [2026-06 follow-up] Timeline visualization: new "Live now — on-screen preview" section renders a live, cycling 16:9 `SceneCanvas` preview per scene with a LIVE badge and per-sequence status (On air / next in Xs / Paused / cyclic). "Next up" rows now show a `SeqThumb` preview of the sequence's first overlay. Verified via authenticated screenshot.

- [2026-06 follow-up] Timeline live-stream monitor: new `streams` collection + CRUD (`/api/streams`, auto-detects hls/vimeo). Timeline has an "Add stream" form (per workspace), a view switcher (Previews grid ↔ Streams big side-by-side), and `StreamMonitor` tiles — HLS via hls.js with a REAL stereo Web Audio VU meter (`VUMeter.jsx`, needs a one-time "Enable audio" gesture + CORS-enabled stream), Vimeo via background iframe with a LIVE indicator + "Audio not available via Vimeo" note (browser can't tap Vimeo iframe audio). Structural/flow verified via screenshot; live stream playback itself can't be verified in the headless preview sandbox.

- P1: Image/photo upload (object storage) instead of URL-only.
- P1: Require re-auth (current password/TOTP) before 2FA reset.
- P2: Per-column timezone/format for clock in data.json.
- P2: Brute-force lockout on login/mfa endpoints.
- P2: Cache-Control/ETag on per-element output endpoints (polled every 1s by vMix).
