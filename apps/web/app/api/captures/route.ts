import { NextResponse } from 'next/server';

import type { RingSnapshot } from '@predator-guard/ring';

import { findCaptureDevice, listCaptures, saveCapture } from '@/lib/captures';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { fetchLatestFrame } from '@/lib/frame';
import { ensureFarm } from '@/lib/farms';
import { createRingClient, describeRingError, ensureFreshAccessToken } from '@/lib/ring';
import { identifyAnimal } from '@/lib/vision';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ captures: await listCaptures(db, farm.id) });
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { deviceId?: unknown; atMs?: unknown; source?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'invalid_body', detail: 'Expected a JSON body.' },
      { status: 400 },
    );
  }

  const ringDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : '';
  if (ringDeviceId === '') {
    return NextResponse.json(
      { error: 'device_required', detail: 'deviceId is required.' },
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

  const device = await findCaptureDevice(db, farm.id, ringDeviceId);
  if (!device) {
    return NextResponse.json(
      { error: 'unknown_device', detail: 'This camera is not stored yet - run a sync first.' },
      { status: 404 },
    );
  }
  if (device.e2ee) {
    return NextResponse.json(
      {
        error: 'e2ee_device',
        detail: 'This camera uses end-to-end encryption and cannot be captured.',
      },
      { status: 409 },
    );
  }

  const requestedAtMs =
    typeof body.atMs === 'number' && Number.isFinite(body.atMs) ? body.atMs : null;
  const source = typeof body.source === 'string' && body.source !== '' ? body.source : 'manual';

  try {
    const { accessToken } = await ensureFreshAccessToken(db, config, farm.id);
    const client = createRingClient(config);
    let snapshot: RingSnapshot | null;
    let capturedAtMs: number;
    if (requestedAtMs === null) {
      const frame = await fetchLatestFrame(client, accessToken, ringDeviceId);
      snapshot = frame?.snapshot ?? null;
      capturedAtMs = frame?.atMs ?? Date.now();
    } else {
      snapshot = await client.fetchImageSnapshot(accessToken, ringDeviceId, {
        atMs: requestedAtMs,
      });
      capturedAtMs = requestedAtMs;
    }
    if (!snapshot) {
      return NextResponse.json(
        { error: 'no_frame', detail: 'The camera has no frame at that instant.' },
        { status: 404 },
      );
    }
    const capture = await saveCapture(db, {
      bytes: snapshot.bytes,
      contentType: snapshot.contentType,
      capturedAt: new Date(capturedAtMs),
      device,
      farmId: farm.id,
      source,
    });
    // One restricted OpenCode call per capture: what type of animal is it?
    // No key in .env.local => animal stays null and nothing is called.
    const animal = await identifyAnimal({
      bytes: snapshot.bytes,
      contentType: snapshot.contentType,
      capturedAt: new Date(capturedAtMs),
    });
    return NextResponse.json({ capture, animal }, { status: 201 });
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
