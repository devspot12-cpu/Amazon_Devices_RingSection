# Predator Guard

**Amazon Devices Hackathon — Ring category.** *(repo: `Amazon_Devices_RingSection`)*

Predator Guard turns a farmer's existing Ring outdoor cameras into a **species-aware
predator alarm**. It tells a fox from a raccoon from the farm's own dog, alerts only on
real threats, and shows *which zone* was hit *and when*.

> **Status:** planning complete, build starting. The service in `app.py` is still the
> placeholder used to prove the CI/CD pipeline end to end.

## Why it is different

A generic wildlife alert names an animal. Predator Guard is **zone-aware**: severity comes
from the *species*, the *zone* it entered, and the *time of day*, with an escalating alert
ladder (push → SMS → call) and a weekly summary of patterns and likely weak spots.

## Read this first

| Doc | What it is |
| --- | --- |
| [`docs/PLAN.md`](docs/PLAN.md) | The full build plan — scope, architecture, data model, rules, roadmap |
| [`docs/ring-api-notes.md`](docs/ring-api-notes.md) | One-page distillation of the Ring Partner API (verified 2026-10-18) |
| [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) | Every surprise, written in the moment |

## Quick start (zero-config simulator)

No Ring account or credentials needed: `npm run dev` runs the app against a bundled fake Ring
API and an embedded Postgres (PGlite, stored in `.pglite/`).

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and:

1. **Link the fake Ring account** — plays Ring's side of the account-linking flow and lands on
   the sign-in page.
2. **Sign in** (name + email) to complete the link. The nonce is matched server-side against
   the stored token — nothing is ever auto-verified.
3. On **Cameras & zones**: *Sync devices from Ring*, then map each camera to coop / pasture /
   shed / gate.
4. Back on the dashboard: **Send a signed test webhook** — the event appears in the feed and in
   `GET /api/events`. That last pair is the M1 gate (`docs/FEATURES.md` §4).

### Real Ring or Postgres

Copy `.env.example` to `.env` and fill in the credentials (`RING_SIM=1` forces the simulator
even when credentials are present).

Fastest path with a real Ring account — one pasted token, nothing else:

```bash
RING_ACCESS_TOKEN=<access token from the Ring developer portal> npm run dev
```

The app reads the account from `GET /v1/users/me`, creates the farm for it, and *Sync devices
from Ring* works with no linking step and nothing in the token vault. Access tokens are
short-lived: paste a fresh one when Ring starts answering 401. Webhooks additionally need
`RING_HMAC_KEY` — without it the webhook route answers 503 instead of accepting a signature
nobody can verify.

For Postgres instead of PGlite:

```bash
docker compose up -d db
# then run with:
#   DATABASE_URL=postgres://predator_guard:predator_guard@localhost:5432/predator_guard npm run dev
```

The Python service in `app.py` is still the placeholder that proves the CI/CD pipeline end to
end; the product itself lives in `apps/web` and `packages/*`.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: branch as `dev/<name>`, open a
PR into `main`, and CI must be green.
