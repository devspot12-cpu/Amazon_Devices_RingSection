import { runLiveHook } from '@/lib/live-hook';
import {
  ringErrorResponse,
  ringLiveConfigured,
  ringLiveStatus,
} from '@/lib/ring-live';

/**
 * /api/ring-live - the live section's status and hook endpoints.
 *
 *   GET  -> whether a token is configured; with a token, the real device list
 *   POST { deviceId, timestampMs?, cameraName? } -> run the live hook once:
 *        snapshot at the event instant, classify, S3 + history **only if an
 *        animal is in the frame**; otherwise the snapshot is reported and
 *        dropped.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    if (!ringLiveConfigured()) {
      return Response.json(
        {
          configured: false,
          detail:
            'A Ring account needs to be linked before devices, live video or motion events can appear here.',
        },
        { status: 200 },
      );
    }
    const status = await ringLiveStatus();
    return Response.json({ configured: true, ...status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ringErrorResponse(err);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as {
      deviceId?: string;
      cameraName?: string;
      timestampMs?: number;
    } | null;
    if (!body?.deviceId || body.deviceId.length > 200) {
      return Response.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
    }
    const outcome = await runLiveHook({
      deviceId: body.deviceId,
      cameraName: body.cameraName,
      timestampMs: body.timestampMs,
    });
    return Response.json(outcome, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ringErrorResponse(err);
  }
}
