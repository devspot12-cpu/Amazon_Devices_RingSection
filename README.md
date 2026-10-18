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

## Quick start

```bash
python app.py
curl http://localhost:8080/health
```

```bash
docker build -t predator-guard .
docker run -p 8080:8080 predator-guard
curl http://localhost:8080/health
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The short version: branch as `dev/<name>`, open a
PR into `main`, and CI must be green.
