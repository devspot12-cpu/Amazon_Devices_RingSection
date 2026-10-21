import { z } from 'zod';

import { getDb } from '@/lib/db';
import { getDetectionImageKey } from '@/lib/history';
import {
  READ_URL_TTL_SECONDS,
  signedCaptureUrl,
  storageConfigured,
} from '@/lib/storage';

export const dynamic = 'force-dynamic';

const DetectionId = z.string().uuid();

/**
 * The picture of one capture.
 *
 * The browser never sees the bucket, the key or a credential: it asks for
 * the detection, and this route redirects to a presigned link that is
 * minted fresh (and expires in minutes). The database holds the object key,
 * not the link - a stored link would die with its signature.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = DetectionId.safeParse((await params).id);
  if (!parsed.success) {
    return Response.json({ error: 'capture_not_found' }, { status: 404 });
  }

  const db = await getDb();
  const imageKey = await getDetectionImageKey(db, parsed.data);
  if (!imageKey) {
    return Response.json(
      { error: 'no_frame', detail: 'This capture has no stored frame.' },
      { status: 404 },
    );
  }
  if (!storageConfigured()) {
    return Response.json(
      { error: 'storage_not_configured', detail: 'Object storage credentials are missing.' },
      { status: 503 },
    );
  }

  try {
    const url = await signedCaptureUrl(imageKey);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        // Cache the redirect for less than the signature's lifetime, so a
        // reload/re-hover inside a few minutes skips the DB lookup too. After
        // that the browser asks this route again and gets a fresh link.
        'Cache-Control': `private, max-age=${READ_URL_TTL_SECONDS - 60}`,
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
