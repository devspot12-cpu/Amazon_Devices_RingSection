import { z } from 'zod';

import { type Db } from '@predator-guard/db';

import { ensureFarm } from '@/lib/farm';
import { getDb } from '@/lib/db';
import { getCamera } from '@/lib/cameras';
import { evaluateDanger, NO_DANGER } from '@/lib/danger';
import { saveDetection, setDetectionImageKey } from '@/lib/history';
import { jsonError } from '@/lib/http';
import { captureKey, putCapture, storageConfigured } from '@/lib/storage';
import { classifyAnimal } from '@/lib/vision';

export const dynamic = 'force-dynamic';

const Body = z.object({
  imageBase64: z.string().min(1),
  cameraId: z.string().uuid().optional(),
  contentType: z.enum(['image/jpeg', 'image/png']).optional(),
  timeframeSeconds: z.number().min(0).optional(),
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Keep the frame that was judged in the object bucket.
 *
 * The picture is worth more than the verdict: the dashboard shows it on
 * hover, so the user can see what the model actually looked at. A failure
 * here must not lose the analysis, so the error is logged and the detection
 * is kept without a picture.
 */
async function storeCapture(
  db: Db,
  detectionId: string,
  image: { bytes: Uint8Array; contentType: 'image/jpeg' | 'image/png' },
): Promise<string | null> {
  if (!storageConfigured()) {
    console.warn(
      JSON.stringify({
        stage: 'storage.not_configured',
        detail: 'No S3 credentials in the environment - the frame was not stored.',
      }),
    );
    return null;
  }
  const key = captureKey(detectionId, image.contentType);
  try {
    await putCapture(key, image.bytes, image.contentType);
    await setDetectionImageKey(db, detectionId, key);
    return key;
  } catch (err) {
    console.warn(
      JSON.stringify({
        stage: 'storage.put_capture',
        key,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
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
  raw = raw.replace(/\s+/g, '');
  // Reject obvious non-base64 before allocating; Buffer.from is lenient and
  // silently drops invalid characters.
  if (raw.length === 0 || raw.length > MAX_IMAGE_BYTES * 1.4) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  const bytes = new Uint8Array(Buffer.from(raw, 'base64'));
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
            'No vision model is configured. Set OPENROUTER_API_KEY in .env.local at the repository root.',
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
    });

    // The frame is stored after the row exists, so the key is derived from
    // the detection id and the row only ever points at a picture that is
    // really in the bucket.
    const imageKey = await storeCapture(db, saved.id, image);

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
      imageKey,
      capturedAt: saved.capturedAt.toISOString(),
      timeframeSeconds: parsed.data.timeframeSeconds ?? 0,
      saved: true,
    });
  } catch (err) {
    return jsonError(err);
  }
}
