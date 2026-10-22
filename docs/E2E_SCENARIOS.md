# E2E test scenarios

Run book for the manual (browser + HTTP) end-to-end pass. One row per scenario;
"Defect" marks what the pass actually found. Keep this file as the regression
checklist - rerun it after every dashboard/camera change.

## Dashboard (`/`)

| ID | Scenario | Expect |
|----|----------|--------|
| D1 | First load with a fresh database | Farm auto-provisioned: 4 default cameras, region picker on the default region, empty states for species grid and threat alerts |
| D2 | Add a camera (name + zone) | Appears in the camera list with its zone label; works again after rename-safe re-submit |
| D3 | Add-camera validation | Empty name -> button disabled; blank-padded name is trimmed server-side |
| D4 | Remove a camera | Confirm dialog, row disappears, its history is gone with it (cascade) |
| D5 | Switch farm region | Watchlist re-renders for the new region; new region is seeded with the default camera set; cameras of the old region not visible |
| D6 | Threat alerts after an analysis | Rows show danger badge, species, Animal Score, camera + zone, farm-local timestamp |
| D7 | Hover preview | Row with a stored frame shows the picture on hover; row without one shows the empty note |
| D8 | Species grid | Chips per species with `peak danger`; cameras without detections show "No detections" |

## Camera check (`/video`)

| ID | Scenario | Expect |
|----|----------|--------|
| V1 | Page with zero cameras in the region | Status explains how to add a camera; watch/snapshot controls disabled |
| V2 | Analyze with a camera from another region | Friendly 404 detail rendered, not a raw crash |
| V3 | Analyze with no vision model configured (no OPENROUTER_API_KEY) | 503 `model_not_configured` surfaced as on-screen failure, frame still shown |
| V4 | Analyze with garbage body | 400 with `image_required`, no server crash |
| V5 | Snapshot flow (image file pick) | Reads file, downscales, sends, shows verdict card |
| V6 | Watch flow (video file pick) | COCO-SSD loads, plays video, captures on first animal hit at >= 0.6 |
| V7 | Pick a new file while an analysis is in flight | Old verdict must NOT pop back in; new file stays current |
| V8 | "Identify current frame" before video metadata loads | Status message "not ready", not a silent no-op |
| V9 | Unmount while watching | Detector loop stops (no background sampling) |

## Sidebar / header (all pages)

| ID | Scenario | Expect |
|----|----------|--------|
| S1 | Critter catch toggle | Critter runs, catches count up, Stop removes the game layer |
| S2 | Emergency contacts | 911 row + optional env contact; Share falls back to clipboard or reports unavailable |
| S3 | Nearest police by address | Results list with phone/call link; unknown address -> friendly error |
| S4 | Nearest police by geolocation | Same list when location granted; explicit error when denied |
| S5 | Region clock | Ticks every second in the farm region's timezone, matches alert timestamps |

## API contract checks (no browser)

| ID | Scenario | Expect |
|----|----------|--------|
| A1 | `GET /api/health` | 200 |
| A2 | `GET /api/cameras` | Farm auto-provisioned; camera list + region again |
| A3 | `POST /api/farm` unknown region | 400 `Unknown region` |
| A4 | `DELETE /api/cameras?id=<random-uuid>` | 404 `camera_not_found` |
| A5 | `POST /api/cameras` bad zone | 400 `Bad camera request` |
| A6 | `GET /api/captures/<detection-without-frame>` | 404 `no_frame` |
| A7 | `GET /api/captures/not-a-uuid` | 404 |
| A8 | `POST /api/analyze` empty body / bad base64 | 400 `image_required` |
| A9 | `POST /api/analyze` unknown cameraId | 404 `camera_not_found` |
| A10 | `GET /api/emergency-nearby?address=ab` | 400 |
| A11 | `GET /api/emergency-nearby?address=<real address>` | Results array + OSM attribution |

## Findings log

Record defects found during the pass here (1 line each), with the fix commit.

- 2026-10-22 pass (branch `dev/dashboard-fixes`), live app + real browser:
  - D1, D2, D3, D4, D5 (render + region form), D8 (empty states) PASS
  - D6/D7 partial PASS: no alert rows exist in this environment (no `OPENROUTER_API_KEY`); API-side contract verified, hover preview code-reviewed since rows cannot be created
  - V1 PASS; V4 PASS (A8); V3 PASS live: corrupt/valid snapshot both render actionable alerts
  - V2 PASS by code-path inspection (camera != farm region -> 404 with friendly detail, checked before the model call)
  - V7, V8, V9 fixed earlier on this branch (`0b99b5d`): stale-verdict guard, not-ready feedback, unmount abort
  - S1 PASS live (toggle on/off verified); S2 PASS (911 row + env-contact row rendered); S3 PASS live (real address -> ranked list with 911 fallback); S5 PASS (clock ticks, farm zone)
  - A1-A11 ALL PASS (see table; A6 note: unknown capture id and frameless capture are both `404 no_frame` - indistinguishable by design)
  - DEFECT found + fixed: failure detail gated behind the frame card -> invisible on snapshot-read errors (Q2); misleading "The analysis was saved, but..." on storage errors merged with unrelated failures -> reworded; both in `/video` and `/check` (the quick-check page was removed afterwards)
  - DEFECT fixed earlier on this branch: watch-loop unmount leak, stale-verdict race, silent busy rejections, dead `window.tf` declaration

