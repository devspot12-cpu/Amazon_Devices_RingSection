# Friction log

Every surprise, in the moment. One row per entry; add it the day it happens, not at
the end. This is a scored deliverable for the hackathon, and it is also the list of
things we would tell Ring to fix.

| # | Date | Where | What happened | Impact | Workaround | Suggested fix |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 2026-10-18 | Planning | The build-plan PDF cannot be read by the agent's PDF reader | Blocked reading the plan | Recovered the full text from the committed `Proposal.md.md` | Ship a `.md`/`.txt` copy of any planning doc next to the PDF |
| 2 | 2026-10-18 | Ring docs | Webhook motion `sub_type` has **no `animal` value** — only `motion`, `human`, `vehicle`, `package_delivery`, `other_motion`. `motion.animal` exists **only in Event History** | The core assumption in the build plan was wrong: Ring will not tell us "animal" on the live trigger | Do our own species classification; use Event History `motion.animal` to backfill and cross-check | Document the webhook vs. history subtype vocabularies side by side |
| 3 | 2026-10-18 | Ring docs | The **same HMAC signing key** is used with **two encodings**: webhooks = hex with a `sha256=` prefix, account-linking nonces = URL-safe Base64 without padding | Easy to write one helper and silently break the other | Separate functions per use, with explicit comments; unit-test both | One page that states both encodings together |
| 4 | 2026-10-18 | Ring docs | App credentials (**Client ID / Secret / HMAC key**) are shown once and **cannot be regenerated**; losing them means deleting and recreating the app | High blast radius for a single mishandled value | Store them in a secrets manager before anything else; never commit | Support key rotation without app deletion |
| 5 | 2026-10-18 | Ring docs | `sub_type` classification only happens when the device has **Smart Alerts** on, and **no API reports whether it is on** | Cannot branch on "is Smart Alerts enabled" | Treat `sub_type` as an open-ended vocabulary; default to *process*, never drop on unknown | Expose the Smart Alerts setting via the API |
| 6 | 2026-10-18 | Ring docs | All media delivered through the API is **watermarked server-side** and the watermark cannot be removed; lower resolution makes it cover more of the subject | Training data must match production, or accuracy silently drops | Train/evaluate on watermarked frames; request full resolution | State the watermark behavior in the Computer Vision Guidelines *and* the media endpoints |
| 7 | 2026-10-18 | Ring docs | Live sessions are capped at **30 s (battery)** / **60 s (line-powered)** and then auto-terminate | Long viewing needs reconnection logic | Prefer Image Snapshots for analysis; reconnect for live viewing | Surface the cap in the session-creation response |
| 8 | 2026-10-18 | Ring docs | Video encryption (**TAKE / E2EE**) makes media unreadable for a subset of devices; E2EE devices are not returned by any API | A CV pipeline must treat unreadable media as expected, not an error | Detect `e2ee.enabled`, degrade gracefully, never retry-loop | A single "can I read this device's media?" flag in capabilities |
| 9 | 2026-10-18 | Repo | The release image was named `aws-demo`, which does not identify the project | The pushed image is hard to find among others | Renamed to `predator-guard` | — |
| 10 | 2026-10-18 | Tooling | The `gh` CLI is not installed locally | Cannot open a PR from the shell | Push the branch and open the PR in the browser | Install `gh`, or drive PRs from the web UI |
| 11 | 2026-10-18 | Repo / CI | `python -m compileall -q .` recursed into virtualenvs and `node_modules` | Slow, and fragile once third-party `.py` files appear | Scoped it with explicit `-x` exclusions | — |

## Template

```
| # | Date | Where | What happened | Impact | Workaround | Suggested fix |
```
