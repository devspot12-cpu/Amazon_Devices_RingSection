# Predator Guard

**Amazon Devices Hackathon — Ring category.** *(repo: `Amazon_Devices_RingSection`)*

Predator Guard shows **whether the animal in front of a camera is dangerous** — and it says so
on screen. You feed it a real video file or a snapshot (no Ring device API access needed); the
AI model names the animal, gives an **Animal Score** (how sure it is, 0–100%), and the rules
engine turns that into a **Danger Type** (CRITICAL / DANGER / WARNING / MONITOR) based on the
zone the camera watches and the time of day. Every result is shown immediately **and saved to
the Postgres history** in parallel, per camera.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and:

1. **Add a camera** on the dashboard (name + zone: coop / pasture / feed shed / gate). Add as
   many as you like — the demo is per camera.
2. **Open the camera check** (`/video`), pick the camera, then either
   * load a **video file** and press *Watch for animal* (a local browser detector spots the
     first animal and captures that exact frame), or
   * press *Identify current frame* at any moment, or
   * upload a **snapshot** directly.
3. The frame goes to the AI model and the answer appears at once: **Animal Score** and
   **Danger Type**, with the captured frame — and the row lands in the history.
4. Back on the dashboard, the **Danger feed** and **Animal types by camera** show what was
   seen, when, and how dangerous it was.

### Configure the AI model

The demo needs one key (in `apps/web/.env.local`, never in git):

```powershell
Copy-Item .env.example apps\web\.env.local
# then edit apps\web\.env.local:
#   OPENROUTER_API_KEY=sk-or-...
```

* **OpenRouter** is the classifier (`OPENROUTER_VISION_MODEL`, default
  `minimax/minimax-m3.1-flash:free`).
* Without `OPENROUTER_API_KEY`, videos and snapshots still play/capture, and the API answers
  503 with setup instructions instead of failing silently.

### Database

Zero-config: no `DATABASE_URL` ⇒ embedded PGlite (real Postgres compiled to WASM), stored in
`.pglite/`.

Real Postgres:

```bash
docker compose up -d db
# then run with:
#   DATABASE_URL=postgres://predator_guard:predator_guard@localhost:5432/predator_guard npm run dev
```

Two tables carry the demo: `cameras` (what the user registers) and `detections` (timestamp,
animal type, animal score, danger type/score, per camera).

## How it fits together

| Piece | What it does |
| --- | --- |
| `apps/web/app/video` | The demo surface: video / snapshot in, verdict on screen |
| `apps/web/app/api/analyze` | One frame → AI model → danger evaluation → history row |
| `apps/web/app/api/cameras` | Register / list / remove cameras |
| `apps/web/lib/vision.ts` | OpenRouter (MiniMax) classifier |
| `apps/web/lib/danger.ts` | Species + zone + time → Danger Type (uses the rules engine) |
| `packages/rules` | The severity rules engine (species × zone × day/night) |
| `packages/vision` | Classifier shapes + the OpenRouter adapter |
| `packages/db` | Drizzle schema + embedded SQL migrations (PGlite or Postgres) |

The Ring OAuth linking, webhook intake, simulator and device-sync pipeline were removed for
this demo — the app is fed by real videos and snapshots instead.

## Read this first

| Doc | What it is |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | The full build plan — scope, architecture, data model, rules |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Feature list and milestones |
| [`docs/ring-api-notes.md`](docs/ring-api-notes.md) | One-page distillation of the Ring Partner API (verified 2026-10-18) |
| [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) | Every surprise, written in the moment |

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: branch as `dev/<name>`, open a
PR into `main`, and CI (type-check + build) must be green.


## Temporary free PostgreSQL setup (Neon)

The app can run locally with embedded PGlite, but Vercel serverless deployments should use a hosted PostgreSQL database. The free Neon plan is suitable for development/demo use:

1. Create an account at [neon.tech](https://neon.tech/).
2. Create a PostgreSQL project and copy the **pooled** connection string.
3. Add `?sslmode=require` if it is not already present.
4. For local development, put it in `apps/web/.env.local` (never commit this file):

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
PGLITE_DATA_DIR=.pglite
```

5. In Vercel, add the same value as a private `DATABASE_URL` environment variable for Preview and Production.
6. Redeploy after changing environment variables.

Do not put the real password in `README.md`, `.env.example`, or Git. Use `.env.example` only for variable names and placeholders. If `DATABASE_URL` is omitted locally, the app falls back to PGlite.

### Vercel project settings

For this monorepo use:

- **Root Directory:** `apps/web`
- **Framework:** Next.js
- **Install Command:** `npm ci`
- **Build Command:** `npm run build --workspace @predator-guard/web`

