import { z } from 'zod';

import { getDb } from '@/lib/db';
import { detectionExists } from '@/lib/history';
import { jsonError } from '@/lib/http';
import { getMedia, linkMedia, mediaView } from '@/lib/media';
import { signedObjectUrl, storageConfigured } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MediaId = z.string().uuid();
const LinkBody = z.object({ detectionId: z.string().uuid() });

/**
 * Read one uploaded file.
 *
 * The database holds the object key, never a signed URL. This route mints a
 * fresh short-lived link and redirects to it, so a bookmarked link keeps
 * working and a leaked URL dies within minutes.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = MediaId.safeParse((await params).id);
  if (!parsed.success) {
    return Response.json({ error: 'media_not_found' }, { status: 404 });
  }
  if (!storageConfigured()) {
    return Response.json(
      { error: 'storage_not_configured', detail: 'Object storage credentials are missing.' },
      { status: 503 },
    );
  }

  const db = await getDb();
  const media = await getMedia(db, parsed.data);
  if (!media) {
    return Response.json({ error: 'media_not_found' }, { status: 404 });
  }

  try {
    const url = await signedObjectUrl(media.objectKey);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // The target is signed for five minutes; never cache the redirect.
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return Response.json(
      {
        error: 'storage_unavailable',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

/**
 * Link an uploaded file to the analysis it fed.
 *
 * The client uploads on selection, so the file is already in the bucket when
 * the vision call returns. This closes the loop with the detection row.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = MediaId.safeParse((await params).id);
    if (!id.success) {
      return Response.json({ error: 'media_not_found' }, { status: 404 });
    }
    const body = LinkBody.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return Response.json(
        { error: 'bad_detection_id', detail: 'detectionId must be a UUID.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    if (!(await detectionExists(db, body.data.detectionId))) {
      return Response.json(
        { error: 'detection_not_found', detail: 'That detection does not exist.' },
        { status: 404 },
      );
    }
    const media = await linkMedia(db, id.data, body.data.detectionId);
    if (!media) {
      return Response.json({ error: 'media_not_found' }, { status: 404 });
    }
    return Response.json({ media: mediaView(media) });
  } catch (err) {
    return jsonError(err);
  }
}
