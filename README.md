# Predator Guard

**For Amazon Ring cameras — know *what* animal it was, not just that something moved.**

Ring already tells you *"animal detected"*. Predator Guard takes the photo from that moment and tells you the **type of animal, the camera/zone, and the time**:

> **Animal: fox (about 91% sure) · Coop cam · captured 03:12**

No new hardware. It works with the Ring cameras you already have.

## Why this helps

- **A fox is not a raccoon.** You see the animal type — `fox`, `coyote`, `raccoon`, `opossum`, `dog`, `deer`, or `unknown` — instead of guessing from a blurry alert.
- **Your own dog looks different from a predator.** The result names the animal, so a quick glance tells you whether to act or ignore it.
- **You know where and when.** Every result sits next to its photo, camera, zone (coop / pasture / shed / gate), and capture time.
- **It does not burn API calls.** The animal check runs **once per saved capture only** — never on the auto-refreshing live view, and never twice for the same event.

## How it works

1. Your Ring camera detects motion and records the event.
2. Predator Guard loads **one photo** from that moment (the event time, not a continuous stream).
3. That single photo is sent for one identification check using your API key.
4. You get a JSON result, and the same result is shown next to the photo in **Live watch**.

```json
{
  "capture": { "capturedAt": "2026-10-19T03:12:00.000Z", "deviceName": "Coop cam", "zoneKind": "coop" },
  "animal": { "species": "fox", "confidence": 0.91, "peopleOnly": false, "status": "done", "capturedAt": "2026-10-19T03:12:00.000Z" }
}
```

If the check fails, the photo is still saved and you see a clear failure message — a capture is never lost because identification hiccuped.

## Try the demo (no Ring camera needed)

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, link the fake Ring account, sync cameras, assign zones, then open **Live watch**: **Capture now** for the current photo, or **Scan newest events** for the latest Ring event photo.

## Use it with your real Ring camera

Create `apps/web/.env.local` (copy `.env.example`) and add only:

```env
RING_ACCESS_TOKEN=your-ring-token
OPENCODE_API_KEY=your-opencode-key
```

Then run `npm run dev`, sync your cameras, assign zones, and open **Live watch**.

- Ring tokens expire — if photos stop loading, paste a fresh token and restart.
- Cameras with end-to-end encryption (E2EE) cannot share photos, so they cannot be captured or checked.
- Keep keys only in `.env.local`. Never put a real key in `.env.example` or any tracked file.

## What you will see

| You see | It means |
| --- | --- |
| `Animal: fox · about 91% sure` | Identified — an estimate from one photo, not a guarantee |
| `Identifying…` | Check in progress (can take up to 15 seconds) |
| `Unknown animal — please look at the photo` | Photo was unclear; photo is still saved |
| `Check failed — please look at the photo` | Key, model, or network problem; photo is still saved |
| `People only in this photo` | No animal named for a people-only photo |
| `Not checked yet` | No API key set, or this capture has no check yet |

Always check the picture itself before acting.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| No photo loads | Paste a fresh `RING_ACCESS_TOKEN`, then check the camera is online in Ring |
| Always "Not checked yet" | Add `OPENCODE_API_KEY` to `apps/web/.env.local` and restart |
| Always "Check failed" | Check the key is correct and `OPENCODE_VISION_MODEL` names a vision model your provider offers |
| Result is `unknown` | Animal may be small/dark in that frame — capture again or check manually |
| E2EE error | That camera blocks photo access; use a non-E2EE camera |

## Ready today / coming next

**Ready:** Ring linking & camera sync, zone mapping, live view, event photo captures, animal-type identification.

**Coming next:** danger scoring per zone/time, push/SMS escalation, weekly pattern summary.

## For developers

App: `apps/web` · Ring: `packages/ring` · Animal check: `packages/vision` · Data: `packages/db`. See `docs/PLAN.md`, `CONTRIBUTING.md`.
