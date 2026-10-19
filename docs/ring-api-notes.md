# Ring Partner API — working notes

Distilled from the Ring Partner API documentation, read in full on **2026-10-18**.
One page, so we stop re-reading the 9,600-line source. Where this disagrees with the
build plan (`Proposal.md.md`), **this file wins** — see `PLAN.md` §3 for the diffs.

Source: <https://developer.amazon.com/docs/ring/api-documentation.html>

---

## Endpoints and environment

| Thing | Value |
| --- | --- |
| API base URL | `https://api.amazonvision.com` |
| OAuth server | `https://oauth.ring.com` |
| Dev Portal | `https://developer.amazon.com/ring/console/apps` |
| Docs MCP | `https://knowledge.appstore-mcp.ring.amazon.dev/mcp` (tools: `search_docs`, `get_doc`) |

> **Server-to-server only.** Browser-originated requests to Ring endpoints are blocked
> by CORS. Every call must come from our backend.

## Credentials (issued once, NOT regenerable)

| Credential | Use |
| --- | --- |
| **Client ID** | Identifies the app in OAuth token requests |
| **Client Secret** | Authenticates the app during token exchange and refresh |
| **HMAC Signing Key** | Verifies webhook signatures **and** generates account-linking nonces |

Losing any of them means deleting the app and creating a new one (before certification).
Store in a secrets manager; never commit.

**Partner-hosted endpoints to register in the portal (all HTTPS):**

| Endpoint | Purpose |
| --- | --- |
| Token Exchange URL | Receives Ring's OAuth authorization code |
| Account Link URL | User sign-in page for nonce-based linking (**sign-in mandatory**) |
| Webhook URL | Receives device/webhook events |
| App Homepage URL | Post-linking configuration page |

## Account linking (one-way, Ring-driven)

1. Ring generates a nonce and redirects the user to our Account Link URL:
   `.../link?nonce=<nonce>&time=<epoch_ms>`, and sets the integration to `awaiting`.
2. Partner validates freshness: **window = 600 s**, reject `> 600 s` **and** future timestamps.
3. **User must sign in** (or create an account). Do **not** auto-verify the nonce.
4. Partner matches the nonce against **unclaimed tokens** and calls
   `POST /v1/accounts/me/app-integrations` with `{ account_identifier, nonce }`.
5. Trap: ident must come server-side from `GET /v1/users/me`, never from the browser.

**Nonce spec**
- `HMAC-SHA256(K_hmac, "<time>:<account_id>")`
- Output: **URL-safe Base64, no padding** (`base64.urlsafe_b64encode(...).rstrip(b'=')`)
- Compare with a **constant-time** comparison.

**Two-step completion**
- `POST /v1/accounts/me/app-integrations` → status `awaiting`
- `PATCH /v1/accounts/me/app-integrations` with status `completed` → **mandatory**

**Status lifecycle:** `awaiting` → `completed` (and `removed` on unlink).

## Tokens

| Token | Lifetime | Notes |
| --- | --- | --- |
| Authorization code | **60 s**, one-time | Exchange immediately at the Token Exchange URL |
| Access token | **~4 h** (`expires_in: 14400`) | `Authorization: Bearer <token>`; a long JWT (~1,300 chars) |
| Refresh token | **~30 days** | Refresh **before** expiry; a dead refresh token forces re-linking |

- Refresh: `POST https://oauth.ring.com/oauth/token`, form-encoded
  `grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...`
- ⚠ **A refresh token cannot be used as a Bearer token** → `401`.
- Response includes a new `access_token` (and usually a new `refresh_token`) — store both.
- Scopes come back in the token response as `scope`.

## Devices

```
GET /v1/devices?include=status,capabilities,location,configurations
GET /v1/devices/{id}
GET /v1/devices/{id}/status
GET /v1/devices/{id}/capabilities
GET /v1/devices/{id}/location           # coarse: country, state
GET /v1/devices/{id}/configurations     # motion zones, privacy zones, image settings
```

- JSON:API shape: `data[]` with `attributes` + `relationships`.
- **Capabilities**: video codecs, motion detection, image enhancements, camera components.
  - Read the **live** codec from the SDP answer, **not** from capabilities (`HEVC` in
    capabilities can answer a WHEP offer with `H264`).
- **Configurations**
  - Motion zones + privacy zones use **normalized coordinates 0.0–1.0** (origin top-left,
    polygon vertices). Convert: `pixel = vertex * frame_dimension`.
  - `motion_detection.enabled == 'on'` before expecting motion events.
  - `e2e_encryption.enabled` → media is unreadable; **degrade gracefully**.
- **Multi-camera devices (Ring Elite)**: one device, several **components**.
  - `component_id` is a **query parameter** for capabilities / configurations / WHEP.
  - Media downloads take a `components` **array in the body** — **exactly one entry**,
    `component_id` as a **string**.
  - Omit it → non-deterministic result. Always send it on multi-camera devices.
  - Motion webhooks carry `attributes.component_ids` (array of strings).

## Webhooks

```
POST <our endpoint>
X-Signature: sha256=<hex hmac>
Content-Type: application/json
```

- Verify: `HMAC-SHA256(K_hmac, raw_body).hexdigest()`, strip the `sha256=` prefix,
  **constant-time compare**.
- ⚠ Compute over the **raw body bytes**, before parsing. Re-serializing changes the bytes
  and every check fails.
- ⚠ Same key as nonces but **hex** here vs **URL-safe Base64** there.

**v1.1 payload**

```json
{
  "meta": { "version": "1.1", "time": "<iso8601>", "request_id": "<uuid>", "account_id": "ava1.ring.account.XXX" },
  "data": {
    "id": "<device_id>_<event_type>_<ts>",
    "type": "motion_detected",
    "attributes": { "source": "<device_id>", "source_type": "devices", "timestamp": 1786715596787,
                    "timestamp_readable": "2026-08-14 08:53:16", "sub_type": "motion", "component_ids": ["0"] },
    "relationships": { "devices": { "links": { "self": "/v1/devices/<device_id>" } } }
  }
}
```

**Event types**: `motion_detected`, `button_press`, `device_added`, `device_removed`,
`device_online`, `device_offline`, `app_integration_added`, `app_integration_removed`,
`subscription_activated`, `subscription_deactivated`.

**Response contract**

| Our status | Ring behavior |
| --- | --- |
| `200–299` | Delivered, no retry |
| `400–499` | **Permanent failure, no retry** (persistent 4xx can disable the endpoint) |
| `500–599` / timeout | Retry with backoff |
| Respond in **< 5 s** | Otherwise treated as a 5xx |

**Retry schedule**: immediate, 1 s, 5 s, 30 s, 2 min, 10 min, 1 h (6 retries / 7 attempts).
Then a **dead letter queue**, events kept **72 h** (replay on request).
**Idempotency**: dedupe on `meta.request_id` (or the event `id`).

**Motion `sub_type` — read it as `data.attributes.sub_type`** (not `data.subType`):

| Smart Alerts | Values |
| --- | --- |
| Off | `motion` |
| On | `human`, `vehicle`, `package_delivery`, `other_motion` |

> There is **no `animal`** on webhooks, and **no API exposes** whether Smart Alerts is on.
> Treat the vocabulary as open-ended: keep an explicit **skip list** (`human`, `vehicle`)
> and pass everything else through to CV.

## Live verification — 2026-10-19 (playground account)

All eight playground endpoints were probed with a fresh token; every one answered `200`.
The playground's Device List curl omits `include=` — without it `data[].attributes` is
only `{name, image_url}` and the sub-resources exist as bare relationship pointers.
Add `include=status,capabilities,location,configurations` to get `included` blocks:

| Playground entry | Endpoint | `data.type` | Verified attributes (first level) |
| --- | --- | --- | --- |
| Users API | `GET /v1/users/me` | `users` | `email`, `first_name`, `last_name` |
| Device List | `GET /v1/devices` | `devices` (array) | `name`, `image_url` |
| Device Discovery | `GET /v1/devices/{id}` | `devices` | same shape; `include=` is accepted here too |
| Status | `GET /v1/devices/{id}/status` | `device-status` | `online`, `reported_at` (ISO), `state`, `audio` |
| Capabilities | `GET /v1/devices/{id}/capabilities` | `device-capabilities` | `battery_status`, `motion_detection`, `video`, ... |
| Locations | `GET /v1/devices/{id}/location` | `locations` | `country`, `state` |
| Configurations | `GET /v1/devices/{id}/configurations` | `device-configurations` | `audio`, `e2e_encryption`, `motion_detection` |
| Event History | `GET /v1/history/devices/{id}/events` | `history-events` (array) | `start`/`end` (epoch **ms**), `event_type`, `is_third_party_reviewed` |

**The include vocabulary is inverted from the relationship names**: `included` items
carry `device-status` / `device-capabilities` / `device-configurations` / `locations`,
and they are linked **only** through `relationships.<name>.data {type,id}` — those ids
are resource ids (e.g. `ava1.ring.device.status.…`), **not** the device id. Matching on
device id + bare type silently yields defaults (friction log row 25).

Other verified details:

- Every list/detail reply carries `meta` (`time`); event items carry `meta.riid`.
- Playground event history: 9 `on_demand` events, **no `sub_type`** (Smart Alerts off),
  `cv_detections.data` empty, no `links.next` while under a page.
- Snapshot download of the playground camera: `200 image/jpeg`, ~106 KB,
  `X-Media-Origin: recording`.
- The playground's live-view section starts a simulated session (`Package` / `Vehicle`
  / `Motion`) and the WHEP workflow is the documented path for viewing it.
- `at_timestamp = now` on the playground device: the presigned GET answers **416**
  (no frame); the newest event's own timestamp returns the JPEG, `X-Media-Timestamp`
  matching that instant. "Live" frames therefore need an event-time fallback
  (friction log row 27).

## Event History

```
GET /v1/history/devices/{device_id}/events?event_types=motion.animal,motion.human
```

- **Metadata only** — no media; pair timestamps with the media endpoints.
- `event_types` supports composite syntax: `motion.animal`, `motion.human`, `motion.vehicle`,
  `motion.other_motion`, plus plain `ding`, `on_demand`. Values combine with OR.
- **Time-gated**: only events after the user's consent date are returned.
- Pagination: follow `links.next` directly (carries filters + `page[key]` cursor).
- `attributes.is_third_party_reviewed` — whether *our* app already pulled media for the event.
- Per-camera attribution is **not** available here; correlate with `component_ids` from webhooks.

## Media

### Image snapshots — our primary path
```
POST /v1/devices/{id}/media/image/download       (JSON body; 2-step)
```
- `type`: `at_timestamp` (with `timestamp`) or `latest_in_range` (with `start_timestamp`,
  optional `end_timestamp`, window ≤ 24 h). Both within the **last 180 days**, ≤ now.
- `image_options`: `format` (`jpeg`|`png`), `resolution.width/height` (1–1920 / 1–1080).
  **Lower resolution makes the watermark cover more of the subject.**
- Step 1 returns **`303 See Other`** + pre-signed `Location`; step 2 `GET` it → binary.
- Response headers: `X-Request-ID`, `X-Media-Timestamp`, `X-Media-Origin`
  (`recording` | `snapshot`).

### Media clips (recorded MP4)
```
POST /v1/devices/{id}/media/video/download       (JSON body; binary response)
```
- ⚠ **Does not trigger recording** — existing footage only; `416 MEDIA_NOT_FOUND` if none.
- `timestamp` (≤ now) + `duration` (≤ 900,000 ms = 15 min), required.
- `video_options`: `codec` (`avc`|`hevc`), `frame_rate` (≤25), `resolution` (≤1920×1080).
- `audio_options.audio_enabled` (default false; silently omitted when unavailable — still `200`).
- `200` full, `206` partial, `301` redirect (follow it).
- Headers: `X-Media-Timestamp`, `X-Media-Length`.

### Live video — WHEP (browser/mobile) and RTSP (server-side)
```
POST   /v1/devices/{id}/media/streaming/whep/sessions      # Content-Type: application/sdp
DELETE /v1/devices/{id}/media/streaming/whep/sessions/{sid}
rtsps://video.rtsp.amazonvision.com:322/v1/devices/{id}/stream
```
- WHEP: POST the SDP offer → **`201`** + `Location` header + SDP answer. Close with DELETE.
- RTSP: TLS only, port **322**, TCP-interleaved, authenticate at `DESCRIBE`
  (`X-Auth-Token` header preferred; `?token=` for FFmpeg who truncate long URL credentials).
- Tracks are **`recvonly`**: video always required, audio optional.
- Session caps: **30 s battery / 60 s line** → reconnect for longer.
- RTSP is explicitly recommended for **server-side** integrations (FFmpeg/GStreamer).

## Rate limits and errors

- **100 requests/second per `client_id`** across all endpoints.
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` (on `429`).
- On `429`: exponential backoff starting at 1 s, honor `Retry-After`.

Errors are JSON:API shaped:
```json
{ "errors": [{ "status": "404", "title": "Not Found", "detail": "..." }] }
```
Codes: `400`, `401`, `403`, `404`, `416`, `422`, `425`, `429`, `500`, `503` (often device offline).

## Constraints that shape the pipeline

1. **Watermark** — every delivered frame has a server-side, unremovable overlay. Train on it.
2. **Encryption (TAKE / E2EE)** — unreadable media is an expected outcome, not an error.
3. **5-second webhook path** — CV is too slow; ack, enqueue, process async.
4. **Tiered CV funnel** is Ring's own recommended pattern: free subtype gate → cheap CPU
   object gate → small domain-tuned classifier → heavy vision model (Bedrock) on low confidence.
5. **User corrections** are the best training labels — build a confirm/relabel loop.

## Testing and certification

- Up to **10 staging users**. Configure staging endpoints first, then production.
- Certification = privacy/security questionnaire + functional testing by Ring + content review.
- Invite-only beta rollout is supported.

## Related reading

- Computer Vision Guidelines — <https://developer.amazon.com/docs/ring/computer-vision-guidelines.html>
- Ring MCP Server — <https://developer.amazon.com/docs/ring/ring-mcp.html>
