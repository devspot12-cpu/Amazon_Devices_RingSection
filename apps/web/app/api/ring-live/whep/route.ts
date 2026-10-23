import {
  createRingWhepSession,
  deleteRingWhepSession,
  ringErrorResponse,
  ringLiveConfigured,
} from '@/lib/ring-live';

/**
 * /api/ring-live/whep?deviceId=... - server-relayed WHEP signaling.
 *
 * The browser builds a recvonly SDP offer and POSTs it here; this route
 * forwards it to Ring's WHEP endpoint with the bearer token attached, and
 * hands the SDP answer back with `X-WHEP-Session` for the DELETE.
 *
 *   POST application/sdp        -> 200 answer (text) + X-WHEP-Session
 *   DELETE ?session=<sessionId> -> closes the Ring session
 *
 * Why a relay: Ring rejects browser-origin calls and a token must not reach
 * the client, so the browser's PC talks to us and we talk to Ring.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    if (!ringLiveConfigured()) {
      return Response.json(
        {
          error: 'ring_not_configured',
          detail: 'Live cameras are not connected on this deployment.',
        },
        { status: 503 },
      );
    }
    const deviceId = new URL(request.url).searchParams.get('deviceId')?.trim();
    if (!deviceId || deviceId.length > 200) {
      return Response.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
    }
    const offer = await request.text();
    if (offer.length < 64 || offer.length > 65_536 || !offer.trimStart().startsWith('v=0')) {
      return Response.json({ error: 'invalid_sdp', detail: 'Expected an SDP offer body.' }, { status: 400 });
    }
    const session = await createRingWhepSession(deviceId, offer);
    // The relay answers 201; the browser only needs the answer + session id.
    return new Response(session.answer, {
      status: 200,
      headers: {
        'Content-Type': 'application/sdp',
        ...(session.sessionId ? { 'X-WHEP-Session': session.sessionId } : {}),
      },
    });
  } catch (err) {
    return ringErrorResponse(err);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const deviceId = params.get('deviceId')?.trim();
    const session = params.get('session')?.trim();
    if (!deviceId || !session) {
      return Response.json({ error: 'session_required', detail: 'deviceId and session are required.' }, { status: 400 });
    }
    await deleteRingWhepSession(deviceId, session);
    return Response.json({ closed: true });
  } catch (err) {
    return ringErrorResponse(err);
  }
}
