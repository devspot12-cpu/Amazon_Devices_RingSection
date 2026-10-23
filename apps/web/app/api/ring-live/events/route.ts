import { jsonError } from '@/lib/http';
import { listRingEvents, ringErrorResponse } from '@/lib/ring-live';

/**
 * /api/ring-live/events?deviceId=... - real event history for one device
 * (GET /v1/history/devices/{id}/events), newest first. The hook loop polls
 * this to notice fresh motion on its own.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const deviceId = new URL(request.url).searchParams.get('deviceId')?.trim();
    if (!deviceId || deviceId.length > 200) {
      return Response.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
    }
    const events = await listRingEvents(deviceId);
    return Response.json({ deviceId, events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return ringErrorResponse(err);
  }
}
