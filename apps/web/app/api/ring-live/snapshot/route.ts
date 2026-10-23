import { jsonError } from '@/lib/http';
import { fetchRingSnapshot, ringErrorResponse } from '@/lib/ring-live';

/**
 * /api/ring-live/snapshot?deviceId=...&timestampMs=... - pull one frame of a
 * device on demand. Returned as base64 JSON, never persisted: this is the
 * preview path. The persisted path (S3 + history) only exists when the hook
 * runs and the classifier actually finds an animal.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const deviceId = params.get('deviceId')?.trim();
    if (!deviceId || deviceId.length > 200) {
      return Response.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
    }
    const timestampRaw = params.get('timestampMs')?.trim();
    const timestampMs = timestampRaw && /^\d+$/.test(timestampRaw) ? Number(timestampRaw) : undefined;

    const shot = await fetchRingSnapshot(deviceId, timestampMs);
    // ~10 MB is a generous ceiling on a 1280x720 JPEG; a bigger blob is a
    // proxy mishap rather than a frame.
    if (shot.bytes.byteLength === 0 || shot.bytes.byteLength > 10 * 1024 * 1024) {
      return Response.json({ error: 'snapshot_unusable', detail: 'Empty or oversized media.' }, { status: 502 });
    }
    return Response.json(
      {
        deviceId,
        contentType: shot.contentType,
        mediaTimestampMs: shot.mediaTimestampMs,
        imageBase64: Buffer.from(shot.bytes).toString('base64'),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return ringErrorResponse(err);
  }
}
