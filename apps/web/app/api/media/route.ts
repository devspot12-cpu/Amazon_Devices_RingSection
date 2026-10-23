import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDb } from '@/lib/db';
import { detectionExists } from '@/lib/history';
import { jsonError } from '@/lib/http';
import { mediaView, saveMedia } from '@/lib/media';
import { deleteObject, putObject, storageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST one uploaded file (photo or video).
 *
 * The bytes go to the S3-compatible bucket under `uploads/<uuid>.<ext>` and
 * the database row keeps the key plus the metadata. An optional
 * `detectionId` links the file to the analysis it fed.
 *
 * The client receives `/api/media/<id>` - a stable link that always resolves
 * to a fresh presigned URL. The signed URL itself is never stored, because it
 * expires.
 *
 * shortcut: the file is proxied through this route, so the body limit is the
 * server's (and ~4.5 MB on Vercel). For bigger uploads, hand the browser a
 * presigned PUT and confirm the key afterwards.
 */

/** Largest accepted upload. Videos are the reason this is not a few MB. */
const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

const MEDIA_TYPES: Record<string, { extension: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { extension: 'jpg', kind: 'image' },
  'image/png': { extension: 'png', kind: 'image' },
  'image/webp': { extension: 'webp', kind: 'image' },
  'image/gif': { extension: 'gif', kind: 'image' },
  'video/mp4': { extension: 'mp4', kind: 'video' },
  'video/webm': { extension: 'webm', kind: 'video' },
  'video/quicktime': { extension: 'mov', kind: 'video' },
};

const DetectionId = z.string().uuid();

export async function POST(request: Request): Promise<Response> {
  try {
    if (!storageConfigured()) {
      return Response.json(
        {
          error: 'storage_not_configured',
          detail: 'File storage is not configured on this deployment.',
        },
        { status: 503 },
      );
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return Response.json(
        { error: 'file_required', detail: 'Send the file as multipart/form-data field "file".' },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return Response.json({ error: 'empty_file', detail: 'The file is empty.' }, { status: 400 });
    }
    if (file.size > MAX_MEDIA_BYTES) {
      return Response.json(
        {
          error: 'file_too_large',
          detail: `Uploads are limited to ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB.`,
        },
        { status: 413 },
      );
    }

    // Browsers append parameters to the type ("video/mp4; codecs=...").
    const contentType = (file.type.split(';')[0] ?? '').trim().toLowerCase();
    const format = MEDIA_TYPES[contentType];
    if (!format) {
      return Response.json(
        {
          error: 'unsupported_media_type',
          detail: `Supported: ${Object.keys(MEDIA_TYPES).join(', ')}.`,
        },
        { status: 415 },
      );
    }

    const detectionValue = form?.get('detectionId');
    const detection =
      typeof detectionValue === 'string' && detectionValue !== ''
        ? DetectionId.safeParse(detectionValue)
        : null;
    if (detection && !detection.success) {
      return Response.json(
        { error: 'bad_detection_id', detail: 'detectionId must be a UUID.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    if (detection?.success && !(await detectionExists(db, detection.data))) {
      return Response.json(
        { error: 'detection_not_found', detail: 'That detection does not exist.' },
        { status: 404 },
      );
    }

    const objectKey = `uploads/${randomUUID()}.${format.extension}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      await putObject(objectKey, bytes, contentType);
    } catch (err) {
      console.warn(
        JSON.stringify({
          stage: 'media.put_object',
          key: objectKey,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return Response.json(
        {
          error: 'storage_unavailable',
          detail: 'The file could not be stored. Try again in a moment.',
        },
        { status: 502 },
      );
    }

    const media = await saveMedia(db, {
      detectionId: detection?.success ? detection.data : null,
      kind: format.kind,
      filename: file.name.slice(0, 255) || `upload.${format.extension}`,
      contentType,
      sizeBytes: file.size,
      objectKey,
    }).catch(async (err) => {
      // A row that cannot be written must not leave an unreachable object.
      await deleteObject(objectKey).catch(() => undefined);
      throw err;
    });

    return Response.json({ media: mediaView(media) }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
