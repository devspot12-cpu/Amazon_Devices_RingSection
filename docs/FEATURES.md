# Predator Guard — Feature set

**Stack:** TypeScript / JavaScript only — Next.js (App Router) full-stack: React UI + Route
Handlers for the API, webhooks and jobs. No separate Python service; the vision step runs as
a Bedrock vision-model call from Node.

> **How to read this doc.** Each feature has an ID, a goal, a user story, **testable**
> acceptance criteria, TypeScript notes and a priority. We build in ID order within a
> milestone (see §4). A feature is "done" when its acceptance criteria are covered by a test.

**Priority:** `P0` = the demo cannot work without it · `P1` = makes it good · `P2` = polish.

---

## 1. Judging-category map

| Category | Features |
| --- | --- |
| **Care-taking** | F5, F6, F9 — species detection, severity rules, weekly weak-spot advice |
| **IoT home automation** | F2, F4, F7 — motion webhook → media pull → escalating alert |
| **Business systems** | F6, F8, F9 — zone policy, audit trail, weekly operational summary |
| **Access control** *(adjacent)* | F6, F11 — zone → severity policy engine, farmer-editable |
| **Accessibility** *(stretch)* | F7 — voice-call escalation + spoken summary |

---

## 2. Feature catalog

### F1 — Ring account linking & token vault · `P0`
**Goal.** A farmer links their Ring account to Predator Guard without us ever operating an
OAuth server, and we store the tokens safely.

**User story.** *As a farmer, I open the app, sign in, and see my Ring cameras appear.*

**Acceptance criteria**
1. `GET /auth/ring/link?nonce&time` renders a **sign-in form** — never auto-verifies.
2. `time` older than **600 s** or in the future is rejected with a readable error.
3. After sign-in, the nonce is matched against unclaimed tokens using
   `HMAC-SHA256(hmacKey, "<time>:<accountId>")`, **URL-safe Base64 without padding**, compared
   in **constant time**.
4. On a match we call `POST /v1/accounts/me/app-integrations` (→ `awaiting`) then
   `PATCH` it to `completed`, and record the platform account id from `GET /v1/users/me`.
5. Tokens are encrypted at rest (**AES-256-GCM**, key from `TOKEN_ENC_KEY`) and never logged.
6. `app_integration_removed` deletes the stored tokens.
7. Access token is refreshed proactively before its ~4 h expiry; a refresh failure surfaces a
   "re-link your account" state instead of a 500.

**TypeScript notes.** Route Handlers under `app/api/ring/link`, `app/api/ring/oauth/*`;
`node:crypto` for HMAC + AES-GCM; `zod` for query/body validation; Drizzle for storage.

**Depends on.** F10 (fake Ring) for tests.

---

### F2 — Webhook intake · `P0`
**Goal.** Accept Ring's motion webhooks safely and fast, then process out of band.

**User story.** *As the system, I receive a motion event and never process a forged one.*

**Acceptance criteria**
1. `POST /api/ring/webhook` verifies `X-Signature: sha256=<hex>` over the **raw body bytes**
   before parsing; a bad signature returns `401` and is not processed.
2. Duplicate `meta.request_id` is ignored (idempotent) and returns `200`.
3. The handler responds **< 5 s** — it enqueues and returns; no CV runs inline.
4. Only candidate events are enqueued: `human` / `vehicle` are dropped at Stage 0, everything
   else (including unknown subtypes) is processed.
5. Every raw payload is persisted for replay, with `meta.account_id` associated to the farm.
6. A route to simulate a webhook exists for local demos (`POST /api/ring/webhook/test`),
   signature-signed like the real thing.

**TypeScript notes.** Need the **raw** body → read `await req.text()` and verify before
`JSON.parse`. `zod` schema in `packages/ring/src/webhook.ts`.

---

### F3 — Device discovery & zone mapping · `P0`
**Goal.** Know which camera is the coop, the pasture, the feed shed.

**User story.** *As a farmer, I label each camera with a zone so alerts tell me where to go.*

**Acceptance criteria**
1. `GET /v1/devices?include=status,capabilities,location,configurations` is fetched and each
   device is stored with name, online status and capabilities.
2. A camera that is `e2ee`-encrypted is flagged and never scheduled for media pull.
3. The UI maps each camera to a zone (`coop | pasture | shed | gate`) and saves it.
4. Motion zones / privacy zones from configurations are stored; processing skips privacy zones.
5. `device_added` / `device_removed` / `device_offline` update state.

**TypeScript notes.** Multi-camera (Ring Elite) `components` handled from day one.

---

### F4 — Media fetch · `P0`
**Goal.** Get the frame that shows the event, cheaply.

**User story.** *As the system, I turn a motion event into one image without a WebRTC stack.*

**Acceptance criteria**
1. Primary path: `POST /v1/devices/{id}/media/image/download` with
   `type=latest_in_range` around the event timestamp → follow the `303` → store the JPEG.
2. Fallback path: `POST /v1/devices/{id}/media/video/download` (MP4, recorded only) and sample
   a few frames; `416 MEDIA_NOT_FOUND` falls back gracefully.
3. Multi-camera devices always send `components: [{ component_id }]` (exactly one, string).
4. A `403`/`416`/`425` produces a `fallback` detection, never an exception that drops the event.
5. Fetch latency is measured and logged per event.

**TypeScript notes.** Handles the `3xx` redirect explicitly; writes media to a local/S3 path;
returns `{ bytes, contentType, mediaTimestamp, componentId }`.

---

### F5 — Species detection (Bedrock vision) · `P0`
**Goal.** Say *fox*, not just *animal* — and only pay for it when it's worth it.

**User story.** *As a farmer, the alert tells me it was a fox, and it doesn't fire for my dog.*

**Acceptance criteria**
1. A **tiered funnel**: Stage 0 subtype gate (free) → Stage 1 cheap presence check → Stage 2
   species classification → Stage 3 heavier model only when Stage 2 is unsure.
2. Stage 2 returns one of `fox | coyote | raccoon | opossum | dog | deer | unknown` with a
   confidence in `[0,1]`.
3. Frames containing **only people** are dropped before analysis and **never stored**.
4. Low-confidence results escalate to the heavier model; both models sit behind one
   `classify(frame)` interface and are swappable by env var.
5. If the vision step times out or errors, the detection is stored as
   `species=unknown` — the event is **never silently dropped** (fail open).
6. A benchmark script reports top-1 accuracy over the local clip set.

**TypeScript notes.** `packages/vision/src/bedrock.ts` calls the Bedrock Converse API with an
image block; `packages/vision/src/funnel.ts` holds the gating logic; models selected via
`BEDROCK_MODEL_ID_FAST` / `BEDROCK_MODEL_ID_STRONG`.

---

### F6 — Rules engine · `P0`
**Goal.** Turn `(species, zone kind, time of day)` into a severity, per the plan's table.

**User story.** *As a farmer, a fox at the coop at 3am is urgent; a raccoon at the shed is not.*

**Acceptance criteria**
1. `severity(species, zoneKind, localTime)` implements the plan's default table exactly.
2. A farmer-specific `rules` row overrides the default for the same key.
3. An `ignore_list` entry (species + zone + optional time window) downgrades to `log`.
4. Quiet hours suppress `low`/`medium` but **never** `high`.
5. A dedupe window (one alert per camera+species per 10 min) adds a **visit counter** to the
   alert instead of sending a new one.
6. Pure function, exhaustively unit-tested — this is the "brain".

**TypeScript notes.** `packages/rules/src/index.ts`, zero I/O, table-driven.

---

### F7 — Alerts & escalation · `P0`
**Goal.** Get the farmer's attention, and know it worked.

**User story.** *As a farmer, I get a push, then an SMS if I ignore it.*

**Acceptance criteria**
1. `high`: push immediately → SMS after 2 min unacked → voice call after 5 min *(stretch)*.
2. `medium`: push → SMS after 10 min unacked. `low`: dashboard/digest only.
3. Acknowledge endpoint stops the ladder and records `acked_at`.
4. Every alert deep-links to its best frame and the event timeline.
5. Channels are pluggable (`push | sms | voice`); SMS via SNS; a `console` channel is used in
   tests and demos.
6. Send failures retry with backoff and are visible in the event log.

---

### F8 — Dashboard · `P1`
**Goal.** Show what happened, where, and when.

**Acceptance criteria**
1. Per-zone timeline of visits with thumbnails.
2. Hour-of-day heatmap (species × hour).
3. Species counts for a selectable window.
4. Device health (online/offline) and last-seen.
5. One-tap correction on any detection (confirm / relabel) — feeds F5's feedback loop.
6. Readable on a phone (a farmer in a field is the real user).

---

### F9 — Weekly summary (Bedrock) · `P1`
**Goal.** Turn a week of events into advice.

**Acceptance criteria**
1. A job aggregates the week's events and asks Bedrock for a summary.
2. The reply is validated against a JSON schema; malformed replies are rejected and retried
   once, then fall back to a deterministic summary.
3. Output names real patterns, e.g. *"fox visited the coop 3 of 5 nights around 3am"*.
4. It is shown as **advice**, not a verdict.

---

### F10 — Simulator & fake Ring API · `P0`
**Goal.** Demo and test without a real predator (or a real Ring account).

**Acceptance criteria**
1. The simulator generates 14 days of Ring-style events with **three planted stories + one red
   herring** (from the plan).
2. It plants: fox at the coop 02:00–04:00 on 3 of 5 weeknights; coyote along the pasture fence
   on two weekends; raccoon at the feed shed every evening; the farm's own dog at 18:00 daily.
3. A fake Ring API implements token / devices / app-integrations / webhook-send, and serves
   canned frames through a `FrameSource` interface.
4. **Real Ring is swapped in by configuration only** — no code fork.
5. Tests assert all three stories are found and the red herring produces **no** alert.

---

### F11 — Settings & rules editor · `P2`
Farmer-editable severity table, ignore list ("our dog"), quiet hours, alert phone number.

### F12 — Demo mode & replay · `P2`
Deterministic clock, "replay the fox night" button, event feed panel, reset-to-seed.

---

## 3. Cross-cutting requirements

| Area | Requirement |
| --- | --- |
| **Privacy** | People-only frames dropped before analysis and never persisted. Privacy zones respected. Retention short. |
| **Fail open** | Any pipeline error degrades to `species=unknown` and still alerts per the rules for `unknown`. |
| **Idempotency** | Webhooks deduped on `meta.request_id`; media/detection writes keyed on the event id. |
| **Observability** | Structured logs per pipeline stage, with which model answered and the confidence. |
| **Accessibility** | Alerts readable as text; confidence never presented as fact; voice escalation for high. |
| **Config** | All credentials and model ids from env, validated at boot with `zod`; missing config fails fast and loudly. |

---

## 4. Build order (milestones)

| Milestone | Features | Demo at the end of it |
| --- | --- | --- |
| **M0 — Foundation** | repo scaffold, `packages/ring` types, health route | `npm run dev` serves a page and `/api/health` |
| **M1 — Link & listen** | F1, F2, F3, F10 (basic) | simulate a signed webhook → an `events` row appears |
| **M2 — See** | F4, F5 | a simulated event yields "fox, 0.91" |
| **M3 — Decide & alert** | F6, F7 | the fox story fires one High alert; the dog fires none |
| **M4 — Show & advise** | F8, F9 | all three planted stories on the dashboard + a weekly summary |

---

## 5. Out of scope (now)

Livestock wellness, siren/light control, audio understanding, non-US markets, multi-tenant
billing. **On-site chime audio** is a stretch (`/media/audio/playback`, needs *Chime Controls*).

---

## 6. Shared domain types (draft)

```ts
export type ZoneKind = 'coop' | 'pasture' | 'shed' | 'gate';
export type Species =
  | 'fox' | 'coyote' | 'raccoon' | 'opossum' | 'dog' | 'deer' | 'unknown';
export type Severity = 'high' | 'medium' | 'low' | 'log';
export type AlertChannel = 'push' | 'sms' | 'voice' | 'console';

export interface MotionEvent {
  requestId: string;          // meta.request_id  (idempotency key)
  accountId: string;          // meta.account_id
  deviceId: string;           // data.attributes.source
  eventId: string;            // data.id
  timestamp: number;          // data.attributes.timestamp (epoch ms)
  subType: string;            // data.attributes.sub_type  (open-ended!)
  componentIds: string[];     // multi-camera
}

export interface Detection {
  id: string;
  eventId: string;
  species: Species;
  confidence: number;
  frameUrl: string | null;
  status: 'pending' | 'done' | 'fallback';
}
```
