import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { fetchLatestFrame } from '@/lib/frame';
import { ensureFarm } from '@/lib/farms';
import { createRingClient, describeRingError, ensureFreshAccessToken } from '@/lib/ring';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const deviceId = new URL(request.url).searchParams.get('deviceId')?.trim() ?? '';
  if (deviceId === '') {
    return NextResponse.json(
      { error: 'device_required', detail: 'Pass ?deviceId=...' },
      { status: 400 },
    );
  }

  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }

  try {
    const { accessToken } = await ensureFreshAccessToken(db, config, farm.id);
    const frame = await fetchLatestFrame(createRingClient(config), accessToken, deviceId, {
      resolution: { width: 640, height: 360 },
    });
    if (!frame) {
      return NextResponse.json(
        { error: 'no_frame', detail: 'The camera has no frame right now.' },
        { status: 404 },
      );
    }
    return new Response(new Uint8Array(frame.snapshot.bytes).buffer, {
      status: 200,
      headers: {
        'content-type': frame.snapshot.contentType,
        'cache-control': 'no-store',
        // Debugging aid: which instant the frame stands for, and whether it
        // came from a recording because "now" had nothing.
        'x-frame-at': new Date(frame.atMs).toISOString(),
        'x-frame-source': frame.fromEvent ? 'event' : 'live',
      },
    });
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
