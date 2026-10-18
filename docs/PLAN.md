# Predator Guard — Build Plan

**Status:** planning · **Owner:** @suchet · **Created:** 2026-10-18
**Stack decision:** **TypeScript / JavaScript only** — Next.js full-stack (React UI + Route
Handlers). The Python worker is dropped; vision runs as an **Amazon Bedrock** vision-model call
from Node. See `FEATURES.md` and §5.

> How to read this doc: Sections 1–8 are the *what and why* (locked before we start coding).
> Section 9 is the *execution roadmap* — phases with concrete tasks and a "done when" gate.
> I execute section 9 in order; each phase ends when its gate is green.

---

## 1. What we are building

**Predator Guard** turns a farmer's existing Ring outdoor cameras into a **species-aware
predator alarm**. It tells a fox from a raccoon from the farm's own dog, alerts only on real
threats, and shows *which zone* was hit *and when*.

| Judging category | How Predator Guard hits it |
|---|---|
| **Care-taking** | Protects livestock; weekly "weak spot" advice for the farmer |
| **IoT home automation** | Motion webhook → media pull → On/off-site alert ladder |
| **Business systems** | Zone-aware severity rules, audit trail, weekly operational summary |
| **Access control** *(adjacent)* | Zone → severity policy is a rules engine (perimeter/livestock/shed) |
| **Accessibility** *(stretch)* | Voice call escalation + spoken summary for users who can't watch a screen |

**US-only.** The Ring Appstore is for US customers with a compatible subscription.

### In the MVP
- Ring account linking (one-way OAuth) + encrypted token storage
- Webhook intake of motion events, subtype-filtered at the edge
- Media pull (image snapshot first, clip fallback) → species detection
- Zone + time rules with escalating alerts (push, then SMS)
- Dashboard: per-zone visit timeline, hour-of-day heatmap, species counts
- Weekly AI summary of patterns and likely weak spots
- Simulator + fake Ring API + end-to-end tests

### Out of scope (phase 2)
- Livestock wellness (reuses the same event history)
- Siren / light control (see §3 — not exposed to partners; **Chime audio playback does exist**)
- Audio understanding (live audio is receive-only and optional)
- India or any non-US market

---

## 2. Source of truth

- **Build plan (PDF):** `Predator Guard Ring build plan.pdf` — the model cannot read PDF
  input directly, but the identical text is already committed in `Proposal.md.md`, so the
  plan is fully captured. Nothing is missing.
- **Feature set:** [`FEATURES.md`](FEATURES.md) — the authoritative list of what we build,
  with testable acceptance criteria and milestones. Where the two disagree, `FEATURES.md` wins.
- **Ring Partner API docs:** https://developer.amazon.com/docs/ring/api-documentation.html
  (read in full 2026-10-18; we will save a distilled snapshot to `docs/ring-api-notes.md` in Phase 0)
- **Companion pages read:** Computer Vision Guidelines, Ring Appstore MCP server.

---

## 3. What the docs actually say (verified 2026-10-18)

This section overrides assumptions in the original proposal where they differ.

### 3.1 The important corrections

| Original assumption | What the docs say | Impact on us |
|---|---|---|
| Webhook motion classified as `human / animal / vehicle` | Webhook `sub_type` ∈ `motion`, `human`, `vehicle`, `package_delivery`, `other_motion`. **There is no `animal` on webhooks.** | We cannot rely on Ring to say "animal". We filter `human`/`vehicle` at Stage 0 and do our own species classification. |
| (Implied) species from Ring | Event History API **does** support `motion.animal` as a filter (`event_types=motion.animal`) | Animal-classified *history* exists — use it to backfill and cross-check, not as the live trigger. |
| "Is there a cheaper snapshot endpoint than a stream?" | **Yes — Image Snapshots** (`POST /devices/{id}/media/image/download`, JPEG/PNG by timestamp or latest-in-range) | This becomes our **primary media path**. No WebRTC needed for the common case. |
| Live stream capture via WHEP + `aiortc` | **RTSP/RTSPS also exists** and is *explicitly recommended for server-side* integrations using FFmpeg/GStreamer | Python worker gets a mature tool. WHEP demoted to optional. |
| Token refresh details unknown | Access ≈ **4 h** (`expires_in: 14400`), Refresh ≈ **30 days**. Refresh tokens **cannot** be used as Bearer tokens. | Proactive refresh is mandatory; a dead refresh token forces re-linking. |
| Siren/light control unsure | Not exposed. **But Chimes have audio playback** (`POST /devices/{id}/media/audio/playback`, needs *Chime Controls*) | Possible audible-on-site alert (stretch). |
| "clips or snapshots from history?" | History returns **metadata only** — pair event timestamps with media endpoints | Keep event rows + fetch media by timestamp. |

### 3.2 Confirmed facts we will build against

**Auth & linking**
- Base URL `https://api.amazonvision.com`; OAuth server `https://oauth.ring.com`.
- **All calls are server-to-server** — browser-originated calls are blocked by CORS.
- Credentials (issued once, not regenerable): **Client ID**, **Client Secret**, **HMAC Signing Key**.
- One-way account linking: Ring redirects to our Account Link URL with `nonce` + `time`.
  - Nonce = `HMAC-SHA256(K_hmac, "<time>:<account_id>")`, **URL-safe Base64, no padding**.
  - Validation window **600 s**; reject future timestamps; constant-time compare.
  - **Sign-in is mandatory** before nonce matching (proves partner-side identity).
  - Claim: `POST /v1/accounts/me/app-integrations` (`awaiting`) → then **`PATCH`** (`completed`).
  - Account ID comes from `GET /v1/users/me` (server-side, not the browser).
- Register 4 HTTPS endpoints in the portal: Token Exchange URL, Account Link URL, Webhook URL, App Homepage URL.
- Portal: https://developer.amazon.com/ring/console/apps

**Webhooks**
- HMAC-SHA256 in **`X-Signature: sha256=<hex>`**, computed over **raw body bytes** (verify *then* parse).
- v1.1 payload; `meta.account_id`, `meta.request_id` (idempotency key), `meta.time`.
- Must respond **200 within 5 s** → ack fast, enqueue, process async.
- `4xx` = permanent (no retry); `5xx`/timeout = retry with backoff (up to 7 attempts, 72 h DLQ).
- Event types incl. `motion_detected`, `device_added/removed/online/offline`,
  `app_integration_added/removed`, `subscription_activated/deactivated`.
- Note: **same HMAC key, different encoding** — webhooks = hex, nonces = URL-safe Base64.

**Devices & media**
- Discovery: `GET /v1/devices?include=status,capabilities,location,configurations`.
- Capabilities: codecs, motion detection, image enhancements, **camera components**.
- Configurations: **motion zones**, **privacy zones** (normalized 0.0–1.0 polygon coords),
  **E2EE flag**. Respect privacy zones; skip processing when E2EE enabled.
- **Image Snapshots** (primary): 2-step → `303` pre-signed `Location` → `GET`. Params
  `type=at_timestamp|latest_in_range`, ≤180 days, window ≤24 h. Headers `X-Media-Timestamp`,
  `X-Media-Origin`.
- **Media Clips**: MP4, **existing recordings only** (no on-demand recording), ≤15 min,
  `416 MEDIA_NOT_FOUND` if nothing recorded, `206` partial.
- **RTSP**: `rtsps://video.rtsp.amazonvision.com:322/v1/devices/{id}/stream` — TLS only,
  TCP-interleaved, auth at DESCRIBE.
- **WHEP**: `POST .../media/streaming/whep/sessions` → `201` + `Location`; close with `DELETE`.
- Live session caps: **30 s battery / 60 s line-powered**. Video always; audio optional `recvonly`.
- Multi-camera (Ring Elite): `component_id` query param (live/config); `components:[{component_id}]`
  **body** (media downloads) — exactly one entry, **string** ids.

**Constraints that shape the pipeline (from CV Guidelines)**
- **Every delivered frame is watermarked** (server-side, unremovable) — train/evaluate on watermarked imagery; prefer full resolution.
- **TAKE / E2EE devices** return unreadable media — treat as expected, degrade gracefully, never error.
- **CV is too slow for the webhook path** → asynchronous processing is mandatory.
- Recommended pattern: **tiered funnel** — Stage 0 free subtype gate → Stage 1 cheap CPU object
  gate → Stage 2 small domain-tuned classifier → Stage 3 heavy vision model (Bedrock) sparingly.
- **User corrections** are the best training labels → build a confirm/relabel loop.

**Ops**
- Rate limit **100 TPS per `client_id`**; `429` + `Retry-After`; `X-RateLimit-*` headers.
- Errors are JSON:API shaped: `{"errors":[{"status","title","detail",...}]}`.
- No official SDK. Docs MCP: `https://knowledge.appstore-mcp.ring.amazon.dev/mcp`
  (`search_docs`, `get_doc`).
- Testing: up to **10 staging users**; certification = privacy/security questionnaire +
  functional test + content review.

---

## 4. Architecture

```
Ring Appstore ──(auth code)──▶ Token Exchange URL ──▶ api (Fastify)
Ring Backend ──(motion webhook, HMAC)──▶ Webhook URL ──▶ api ──▶ Postgres (events) ──▶ pg-boss
                                                                   │
                                                          vision worker (FastAPI)
                                                                   │
                              Amazon Vision API ◀── snapshots / clips / RTSP ──▶ species model
                                                                   │
                                                     detections ──▶ rules engine ──▶ alerts
                                                                   │
                                                          dashboard (Next.js)
                                                                   │
                                                     weekly job ──▶ Bedrock summary
```

**Design rules**
1. Verify webhook signature on the raw body, then ack < 5 s, then enqueue.
2. One module owns all outbound Ring calls (`packages/ring-client`) — typed, retrying, refreshing.
3. Real Ring vs fake Ring is a **configuration switch only**, never a code fork.
4. Fail **open**: a vision timeout becomes `species=unknown` → never silently drop a threat.

### Repo layout (monorepo)

```
predator-guard/
  apps/
    web/           # Next.js (App Router): dashboard + every Route Handler
      app/
        api/       # ring link, webhook, devices, events, alerts, summary
        page.tsx   # dashboard
  packages/
    ring/          # typed Partner API client + webhook types (JSON:API, retry, refresh)
    db/            # Drizzle schema + migrations
    rules/         # severity engine (pure, table-driven)
    vision/        # Bedrock adapter + CV funnel + frame selection
    sim/           # simulator + fake Ring API + FrameSource
  docs/
    PLAN.md  FEATURES.md  ARCHITECTURE.md  CRITIQUE.md  FRICTION_LOG.md  ring-api-notes.md
  docker-compose.yml   # Postgres + web
```

---

## 5. Tech stack

| Layer | Choice | Why |
|---|---|---|
| API, webhooks, jobs | **Next.js Route Handlers** (Node) | One runtime for UI + API; matches Ring's Hello World sample |
| Dashboard | **Next.js (React)** | Same app as the API — no second service to host |
| Language | **TypeScript**, strict | Typed JSON:API and webhook payloads |
| Database | **Postgres**; **PGlite** in tests | Same SQL in tests, no Docker needed in CI |
| ORM / migrations | **Drizzle** | Light, type-safe |
| Validation | **zod** | One schema validates webhooks, request bodies and env |
| Job queue | **pg-boss** | Runs on Postgres — no Redis to host |
| Vision | **Amazon Bedrock** vision model, Converse API | No Python service; gated on confidence per Ring's CV guidelines |
| Media pull | **Image Snapshots** first → **Media Clips** fallback → **RTSP** optional | Cheapest path first; no WebRTC for the common case |
| Alerts | **Amazon SNS** (SMS), web push; voice call as stretch | Fits the Amazon theme |
| Weekly summary | **Amazon Bedrock** (Nova/Claude) | Schema-validated JSON output |
| Tests | **Vitest**, PGlite | See §10 |
| Hosting | Any public HTTPS host (Ring requires HTTPS); tunnel in dev | Webhooks must reach us |

> **Pivot (2026-10-18).** The original plan split the app across TypeScript and a Python vision
> worker. We are going **TypeScript/JavaScript only**: the vision step becomes a Bedrock vision
> call from Node, which removes a whole service, a language boundary and the `aiortc` risk.
> `/analyze` is now an internal function, not an HTTP service. See `FEATURES.md` for the
> feature-by-feature consequences.

**Env vars** (names are ours; confirm against the portal)
`RING_CLIENT_ID`, `RING_CLIENT_SECRET`, `RING_HMAC_KEY`, `TOKEN_ENC_KEY`,
`DATABASE_URL`, `VISION_URL`, `AWS_REGION`, `SNS_TOPIC_ARN`, `BEDROCK_MODEL_ID`,
`PUBLIC_BASE_URL`.

---

## 6. Data model

Eight Postgres tables (+ one optional). Keep **raw webhook payloads** so we can replay them.

| Table | Key columns | Notes |
|---|---|---|
| `farms` | id, name, owner_email, ring_account_id, alert_phone | One farm per linked Ring account |
| `ring_tokens` | farm_id, access_enc, refresh_enc, expires_at | Encrypted; deleted on unlink |
| `devices` | id, farm_id, ring_device_id, name, zone_id, capabilities | From `GET /v1/devices` |
| `zones` | id, farm_id, name, kind (coop, pasture, shed, gate), livestock | Drives rule severity |
| `events` | id, device_id, ring_event_id (unique), class, occurred_at, raw_json | Unique id ⇒ idempotency |
| `detections` | id, event_id, species, confidence, frame_url, status | status: pending/done/fallback |
| `rules` | id, farm_id, zone_kind, species, time_window, severity, enabled | User-editable |
| `alerts` | id, detection_id, severity, channel, sent_at, acked_at | Escalation state |
| `ignore_list` *(optional)* | species, zone, time_window, label | "our dog" feature |

---

## 7. Rules & alerts

Severity = f(species, zone kind, time of day). Defaults below; farmers can edit.

| Species | Livestock zone, night | Livestock zone, day | Non-livestock zone |
|---|---|---|---|
| Coyote, fox, bobcat | **High** | **Medium** | Low (log) |
| Stray/unknown dog | **High** | Medium | Low (log) |
| Raccoon, opossum | Medium | Low | Log only |
| Deer / other wildlife | Log only | Log only | Log only |
| Ignore-listed animal | Log only | Log only | Log only |
| Species unknown (`class=animal`) | Medium | Low | Log only |

**Escalation ladder**
1. **High:** push now → SMS after 2 min unacked → voice call after 5 min (stretch).
2. **Medium:** push → SMS after 10 min unacked.
3. **Low:** dashboard + daily digest only.

**Guardrails**
- **Dedupe:** one alert per camera+species per 10 min; alert carries a visit counter.
- **Quiet hours** apply to Low/Medium only; High always goes through.
- **Fail open:** vision timeout ⇒ "species unknown", never a silent drop.
- Every alert links to its best frame and the event timeline.

---

## 8. Vision pipeline (the tiered funnel)

| Stage | Job | Cost | Our implementation |
|---|---|---|---|
| **0 — subtype gate** | Drop `human`/`vehicle` from the webhook *before any download* | free | In the webhook handler; open-ended **skip-list**, everything else falls through |
| **1 — object gate** | "Is an animal plausibly present, and where?" | near-free CPU | Small detector on 1 best frame (favor recall, keep bounding box) |
| **2 — species classify** | fox / coyote / raccoon / dog / other | cents/1k | Small classifier on a tight crop |
| **3 — verify / describe** | Resolve low confidence; produce readable text | premium | Bedrock vision model, **gated on low confidence** |

**Frame selection (before any paid inference):** decode a mostly-still frame from the
snapshot hit (or sample a clip lightly), drop blurry/near-black frames, let the detector pick
the winner, crop tight for Stage 2 and keep the annotated full frame for Stage 3.

**Fallback:** if media is unavailable or slow, alert on `class=animal` without species.

**Benchmark target:** ≥85% top-1 on fox / coyote / dog / other across ~50 night+day clips.

---

## 9. Execution roadmap

Each phase = a set of tasks I will do in order, ending at a **gate**. I stop at each gate for
your go-ahead.

### Phase 0 — Repo & CI foundation
*Gate: a PR into `main` is green.*
- [ ] Harden `ci.yml`: scope `compileall` to source dirs; add Node lint/test job + Python pytest job; keep Docker build check.
- [ ] Decide the image name (`<user>/predator-guard`) in `release.yml`; commit the pending `IMAGE_NAME` change.
- [ ] Add `docs/` (this file), `docs/FRICTION_LOG.md` (entry 1: portal sign-up), `docs/ring-api-notes.md`.
- [ ] `.gitignore`: confirm `.env` rules hold; ensure the PDF/notes policy is deliberate.
- [ ] Push `dev/starter-pack`, open the PR into `main`, watch the guard pass.

### Phase 1 — Monorepo scaffold + fake Ring
*Gate: `ring-client` tests pass against the fake API.*
- [ ] Scaffold `apps/api`, `apps/web`, `services/vision`, `packages/{ring-client,db,sim}`.
- [ ] `docker-compose.yml` (Postgres) + Drizzle schema + first migration.
- [ ] `packages/ring-client`: typed calls, JSON:API parsing, retry on `429` honoring `Retry-After`, proactive token refresh.
- [ ] `packages/sim`: fake token / devices / app-integrations / webhook sender + `FrameSource` (real=WHEP/RTSP, fake=JPEG files).

### Phase 2 — Account linking & token vault
*Gate: a staging Ring account shows the integration as `completed`.*
- [ ] Link endpoint: validate `nonce` + `time` (≤600 s, no future), then mandatory sign-in.
- [ ] `POST` → `PATCH /v1/accounts/me/app-integrations` to reach `completed`.
- [ ] Store tokens AES-256-GCM encrypted (`TOKEN_ENC_KEY`); never log them.
- [ ] Refresh before expiry; on `app_integration_removed`, delete tokens.

### Phase 3 — Webhooks, devices, zones
*Gate: walking in front of a camera creates an `events` row with its class.*
- [ ] Public HTTPS URL (tunnel in dev); register in the portal.
- [ ] HMAC verify on the **raw body**, constant-time; ack < 5 s; enqueue in pg-boss; dedupe on `meta.request_id`.
- [ ] Keep only candidate events (`animal`-plausible); log and drop the rest.
- [ ] Device discovery → screen mapping each camera to a zone (coop / pasture / shed).

### Phase 4 — Media + vision worker
*Gate: a real or recorded clip returns species + confidence in < 15 s.*
- [ ] FastAPI `POST /analyze` (device id + short-lived token).
- [ ] Image Snapshots → (fallback) Media Clips → sample ~5 frames, time each step.
- [ ] Stage 1 detector → Stage 2 classifier; return species, confidence, best frame.
- [ ] Drop people-only frames before analysis; store no human images.
- [ ] Benchmark on ~50 clips.

### Phase 5 — Rules & alerts
*Gate: the simulator's fox story fires one alert; the red herring fires none.*
- [ ] Rules engine per §7; alert ladder push → SMS → (voice, stretch).
- [ ] Acknowledge endpoint; 10-minute dedupe window per camera+species.
- [ ] Ignore list (species, zone, time window).

### Phase 6 — Dashboard & weekly summary
*Gate: the dashboard shows all three planted stories.*
- [ ] Per-zone timeline, hour-of-day heatmap, species counts, best-frame thumbnails.
- [ ] Weekly job: aggregate → Bedrock → validate reply against a JSON schema.
- [ ] Render advice, e.g. *"fox visits coop 3 of 5 nights around 3am"*.

### Phase 7 — Hardening & submission
*Gate: someone else can run the demo from the README alone.*
- [ ] End-to-end test on PGlite: seed → webhook → vision (stub) → rules → alert → dashboard → summary.
- [ ] Failure paths: expired token, WHEP/RTSP failure, `429`, duplicate webhook, vision timeout.
- [ ] Write `CRITIQUE.md`, finish `FRICTION_LOG.md`, write privacy notes.
- [ ] Record a 2–3 min demo (simulator replay, then a live trigger if a camera exists).
- [ ] Fresh-clone test: `docker compose up`, seed, demo works.

---

## 10. Simulator & tests

The simulator generates **14 days** of raw Ring-style events with **three planted stories +
one red herring**. Tests pass only if we find the stories and ignore the decoy.

| Item | Plants | Test expects |
|---|---|---|
| **Story A** | Fox at the coop, 02:00–04:00, 3 of 5 weeknights | Pattern found; 1 High alert/visit; summary names coop + hour band |
| **Story B** | Coyote along the pasture fence, two weekends | Pattern found; summary suggests checking the fence line |
| **Story C** | Raccoon at the feed shed each evening after feeding | Pattern found; summary suggests securing feed |
| **Red herring** | Farm's own dog crossing the yard at 18:00 daily | No alert; not reported as a threat |

**Test layers**
1. **Unit** — HMAC check, nonce age limit, token encryption/refresh, rules table, dedupe window.
2. **Client** — `ring-client` against the fake API incl. `429` + `Retry-After` and expired tokens.
3. **Vision** — pytest on a fixed clip set; assert species + a confidence floor.
4. **Brain** — simulator in → stories found, red herring ignored.
5. **End-to-end (PGlite)** — seed → webhook → vision stub → rules → alert → dashboard → summary.
6. **AI reply parsing** — canned Bedrock responses incl. malformed, validated against a schema.

---

## 11. CI/CD

The starter pack already gives us the shape: **PR-only → `main`**, `dev/*` branch guard, no
merge commits, Docker build check on PR, push to Docker Hub on merge. We extend it:

- `apps/api`, `apps/web`, `packages/*` → Node job (lint + `vitest`).
- `services/vision` → Python job (ruff + `pytest`).
- End-to-end job on **PGlite** (no Docker services needed).
- Keep the existing guard + Docker build check; rename the released image to `predator-guard`.

---

## 12. Risks & open questions

| Risk | Likelihood | Mitigation |
|---|---|---|
| No US Ring account / camera for testing | High | Build on the fake Ring API; apply for Developer Early Access; ask organizers for a sandbox |
| Server-side media capture slow/fragile | Medium | **Prefer Image Snapshots** (no WebRTC); RTSP for live; alert on `class=animal` fallback |
| Species model weak on night IR | Medium | Collect/simulate night clips early; report measured accuracy honestly |
| Webhook payload differs from docs | Medium | Store raw payloads; adapt parser; log as friction |
| E2EE/TAKE devices return unreadable media | Medium | Detect `e2ee`.enabled; degrade gracefully, never error |
| Deadline shorter than 8 days | Unknown | Cut weekly summary + voice calls first |

**Open questions for you**
1. Judging criteria and the exact deadline?
2. Does the contest require specific AWS services (Bedrock/SNS)?
3. Do you have (or can you get) a US Ring account + outdoor camera?
4. Who is the demo audience: judges only, or real farmers?

---

## 13. Scored extras (write as we go, not at the end)

- **`docs/FRICTION_LOG.md`** — one row per surprise.
  `| # | Date | Where | What happened | Impact | Workaround | Suggested fix |`
- **`docs/CRITIQUE.md`** — state each objection strongly, then answer it:
  1. "Farm cameras already exist." → We reuse cameras the farmer already owns.
  2. "A wildlife-alert Ring app already exists." → Zone-aware rules + escalation + weekly patterns.
  3. "Night footage causes false alarms." → Measured accuracy, fail-open, dedupe, red-herring test.
  4. "Cameras see people; privacy." → People-only frames dropped before analysis, never stored.
  5. "Ring needs Wi-Fi + a subscription." → Honest limit; target farmsteads with coverage.
  6. "The stream may be too slow." → Fallback on `class=animal`; timing in the friction log.

---

## 14. Immediate next action

The build is driven by [`FEATURES.md`](FEATURES.md) §4. Status as of 2026-10-19:

- **M0 — Foundation: done on `main`** (PR #4). TypeScript workspace, `packages/ring` types,
  health route, CI on every PR.
- **M1 — Link & listen: done on `dev/m1-link-and-listen`** (PR pending). F1 account linking
  with the HMAC nonce claim and the AES-256-GCM token vault; F2 webhook intake with signature
  verification, dedupe and the `jobs` drain; F3 device discovery + zone mapping; F10 the
  mounted fake Ring API, the demo bootstrap and the dashboard home. Gate: a signed simulated
  webhook lands as an `events` row — covered by the simulator walkthrough in the README.
- **M2 — See (next):** F4 media pull (image snapshots, E2EE-aware) and F5 species
  classification through the Bedrock vision model. Gate: a simulated event yields
  "fox, 0.91". `process_event` in `apps/web/lib/pipeline.ts` is the seam: today it is an
  explicit stub that records the event and stops.
- **M3 — Decide & alert:** F6 zone→severity policy, F7 escalation ladder.
- **M4 — Show & advise:** F8 dashboard, F9 weekly summary.

Next step is M2 on a new `dev/*` branch off `main` once M1 has merged.
