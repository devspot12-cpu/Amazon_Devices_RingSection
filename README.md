# Predator Guard

Predator Guard analyzes a video frame or snapshot, identifies the animal, and estimates its danger based on the farm region, camera zone, and time. Results are saved to the dashboard's detection history.

This demo uses media you provide; it does not connect to Ring devices or Ring APIs. Animal identification is an estimate, not a substitute for human judgment.

## Run locally

Requirements: Node.js 20 or later.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. The app uses a local PGlite database by default, so no database service is required. `.env.local` is loaded from the repository root and must not be committed.

To enable animal identification, add your OpenRouter key to the repository-root `.env.local`:

```env
OPENROUTER_API_KEY=your-key
```

The default model is `minimax/minimax-m3.1-flash:free`. To use another OpenRouter model, set `OPENROUTER_VISION_MODEL` to its model ID (choose one that accepts images):

```env
OPENROUTER_VISION_MODEL=openai/gpt-4o-mini
```

Keep both values in the same root `.env.local`, outside `apps/`. The app loads that file for the web workspace; do not create a separate `apps/web/.env` or `.env.local`. `.env.example` lists the available settings. Without an API key, analysis returns a setup error.

## Optional services

- **PostgreSQL:** Set `DATABASE_URL` in `.env.local`. For local development, `docker compose up -d db` starts the included Postgres service. Otherwise, the app uses PGlite and stores its data in `.pglite/`.
- **Object storage:** Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` to save uploaded media and analyzed frames. For S3-compatible storage, also set `AWS_ENDPOINT_URL_S3`; `AWS_REGION` and `AWS_S3_BUCKET` are optional.

See `.env.example` for the available environment variables. Never add real credentials to it or to Git.

## Project layout

- `apps/web` — Next.js app, dashboard, camera check, and API routes
- `packages/db` — database schema and migrations
- `packages/rules` — regional predator and danger rules
- `packages/vision` — vision classifier types and OpenRouter adapter
- `packages/ring` — shared Ring-domain types; no Ring API integration

## Useful links

- `/video` — analyze a video or snapshot
- `/openapi.json` — API specification
- `/llms.txt` — site and API guide for AI tools
- [`docs/E2E_SCENARIOS.md`](docs/E2E_SCENARIOS.md) — end-to-end test scenarios
- [`docs/FRICTION_LOG.md`](docs/FRICTION_LOG.md) — development notes
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution workflow
