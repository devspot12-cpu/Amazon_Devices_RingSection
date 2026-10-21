import { z } from 'zod';

import { ensureFarm } from '@/lib/farm';
import { getDb } from '@/lib/db';
import { getCamera } from '@/lib/cameras';
import { evaluateDanger, NO_DANGER } from '@/lib/danger';
import { saveDetection } from '@/lib/history';
import { jsonError } from '@/lib/http';
import { classifyAnimal } from '@/lib/vision';

export const dynamic = 'force-dynamic';

const Body = z.object({
  imageBase64: z.string().min(1),
  /** Small JPEG of the same frame, kept with the detection for the hover preview. */
  thumbnailBase64: z.string().max(400_000).optional(),
  cameraId: z.string().uuid().optional(),
  contentType: z.enum(['image/jpeg', 'image/png']).optional(),
  timeframeSeconds: z.number().min(0).optional(),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Normalise the small preview frame to a data URL, or drop it.
 *
 * The browser sends a JPEG data URL; a bare base64 payload is accepted too
 * and treated as JPEG. Anything that is not image data is ignored rather
 * than failing the analysis - the frame itself is what matters.
 */
function decodeThumbnail(value: string | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png));base64,(.*)$/i.exec(raw);
  const base64 = dataUrl ? dataUrl[2]! : raw;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const contentType = dataUrl ? dataUrl[1]!.toLowerCase() : 'image/jpeg';
  return `data:${contentType};base64,${base64}`;
}

function decodeImage(
  body: z.infer<typeof Body>,
): { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png' } | null {
  let contentType: 'image/jpeg' | 'image/png' = body.contentType ?? 'image/jpeg';
  let raw = body.imageBase64.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png));base64,(.*)$/i.exec(raw);
  if (dataUrl) {
    contentType = dataUrl[1]!.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
    raw = dataUrl[2]!;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
  return { bytes, contentType };
}

/**
 * POST a single frame (photo or video frame). If a cameraId is given, score
 * against that camera's zone and record as 'camera'. If omitted, judge as a
 * general manual check against the farm region and record as 'manual'.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = Body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: 'Bad analyze request' }, { status: 400 });
    }
    const image = decodeImage(parsed.data);
    if (!image) {
      return Response.json(
        { error: 'image_required', detail: 'imageBase64 (JPEG/PNG frame) is required.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const farm = await ensureFarm(db);
    const region = farm.region;

    let camera: { id: string; name: string; zoneKind: string } | null = null;
    if (parsed.data.cameraId) {
      const found = await getCamera(db, parsed.data.cameraId);
      if (!found) {
        return Response.json(
          { error: 'camera_not_found', detail: 'Register this camera on the dashboard first.' },
          { status: 404 },
        );
      }
      if (found.region !== region) {
        return Response.json(
          {
            error: 'camera_not_found',
            detail: 'This camera belongs to a different region. Switch the farm region or pick a camera from the current region.',
          },
          { status: 404 },
        );
      }
      camera = { id: found.id, name: found.name, zoneKind: found.zoneKind };
    }

    const verdict = await classifyAnimal(image);
    if (!verdict) {
      return Response.json(
        {
          error: 'model_not_configured',
          detail:
            'No vision model is configured. Set OPENROUTER_API_KEY in apps/web/.env.local.',
        },
        { status: 503 },
      );
    }

    const capturedAt = new Date();
    const zoneKind = camera ? (camera.zoneKind as any) : 'gate';
    const danger = verdict.peopleOnly
      ? NO_DANGER
      : evaluateDanger(verdict.species, zoneKind, capturedAt, region);
    const animalScore = Math.round(verdict.confidence * 100);

    const saved = await saveDetection(db, {
      cameraId: camera ? camera.id : null,
      source: camera ? 'camera' : 'manual',
      region,
      species: verdict.species,
      animalScore,
      dangerType: danger.dangerType,
      severity: danger.severity,
      dangerScore: danger.dangerScore,
      model: verdict.model,
      peopleOnly: verdict.peopleOnly,
      status: verdict.status,
      capturedAt,
      thumbnail: decodeThumbnail(parsed.data.thumbnailBase64),
    });

    return Response.json({
      source: saved.source,
      camera,
      farm: region ? { region } : null,
      animal: {
        species: verdict.species,
        score: animalScore,
        model: verdict.model,
        peopleOnly: verdict.peopleOnly,
        status: verdict.status,
        reason: verdict.reason,
      },
      danger: { type: danger.dangerType, severity: danger.severity, score: danger.dangerScore },
      detectionId: saved.id,
      capturedAt: saved.capturedAt.toISOString(),
      timeframeSeconds: parsed.data.timeframeSeconds ?? 0,
      saved: true,
    });
  } catch (err) {
    return jsonError(err);
  }
}
