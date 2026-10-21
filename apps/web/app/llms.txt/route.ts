import { REGIONS } from '@predator-guard/rules';

import { siteUrl } from '@/lib/site';

const REPO = 'https://github.com/suchet-kapoor/Amazon_Devices_RingSection/blob/main';

/**
 * /llms.txt (https://llmstxt.org) - a plain-Markdown map of the site for AI
 * tools and agents: what each page does, and how to call the JSON API directly.
 */
export function GET(): Response {
  const base = siteUrl();
  const regions = REGIONS.map((region) => `\`${region.id}\` (${region.label})`).join(', ');
  const body = `# Predator Guard

> AI farm watch. Feed a video frame or snapshot, the vision model names the animal, and the app returns an Animal Score (model confidence, 0-100) and a Danger Type (CRITICAL / DANGER / WARNING / MONITOR / NONE) tuned to the camera's zone, the time of day and the farm's US region. Every result is saved to per-camera history.

Animal ID is an estimate - a human should check the frame before acting. In immediate danger call 911 (US). Times on the dashboard are farm-local (the region's time zone).

## Pages

- [Dashboard](${base}/): cameras, recent threat alerts, species by camera, farm region and predator watchlist. Sections: [#cameras](${base}/#cameras), [#species](${base}/#species), [#threat-alerts](${base}/#threat-alerts).
- [Camera check](${base}/video): load a video or snapshot, pick a camera, analyze a frame.
- [Quick check](${base}/check): upload a photo or video without a camera; saved as source "manual".

## API

Machine-readable spec: [OpenAPI 3.1](${base}/openapi.json). All endpoints answer JSON. Errors share one shape: \`{ "error": string, "detail"?: string }\` with an HTTP status. No authentication.

- \`GET ${base}/api/health\` - liveness: \`{ "status": "ok", "service": "predator-guard" }\`.
- \`GET ${base}/api/farm\` - farm profile and the region list: \`{ farm: { id, region, updatedAt } | null, regions: [{ id, label, states, blurb }] }\`.
- \`POST ${base}/api/farm\` - set the region. Body \`{ "region": "<id>" }\`. Region ids: ${regions}.
- \`GET ${base}/api/cameras\` - cameras of the current region: \`{ cameras: [...], farm: { region } }\`.
- \`POST ${base}/api/cameras\` - register a camera. Body \`{ "name": string (1-80), "zoneKind": "coop" | "pasture" | "shed" | "gate" }\` -> 201 \`{ camera }\`.
- \`DELETE ${base}/api/cameras?id=<uuid>\` - remove a camera **and its whole history** (irreversible) -> \`{ deleted: true }\`.
- \`POST ${base}/api/analyze\` - judge one frame. Body \`{ "imageBase64": "<JPEG/PNG base64 or data: URL, max 10 MB>", "cameraId"?: "<uuid>", "contentType"?: "image/jpeg" | "image/png", "timeframeSeconds"?: number }\`. Without cameraId the frame is judged as a manual check. Returns \`{ source, camera, farm, animal: { species, score, model, peopleOnly, status, reason }, danger: { type, severity, score }, detectionId, imageKey, capturedAt, saved }\`. 503 \`model_not_configured\` when no vision key is set.
- \`POST ${base}/api/media\` - store the original photo/video. multipart/form-data field \`file\` (jpeg, png, webp, gif, mp4, webm, mov; max 100 MB) and optional \`detectionId\`.
- \`GET ${base}/api/media/<id>\` and \`GET ${base}/api/captures/<detectionId>\` - 302 to a short-lived signed URL of the stored file / analyzed frame.
- \`GET ${base}/api/emergency-nearby?address=<text>\` or \`?lat=<n>&lon=<n>\` - nearest police stations from OpenStreetMap.

## Docs

- [README](${REPO}/README.md): setup and architecture.
- [Features](${REPO}/docs/FEATURES.md): feature list and milestones.
- [Build plan](${REPO}/docs/PLAN.md): scope, data model, danger rules.

## Optional

- [Sitemap](${base}/sitemap.xml)
- [Source code](https://github.com/suchet-kapoor/Amazon_Devices_RingSection)
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
