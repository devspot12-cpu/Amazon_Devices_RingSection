import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { events as eventRows } from '@predator-guard/db';
import { findCaptureDevice, getDetectionForEvent, listCapturedEventIds, markCapturePending, saveCapture } from '@/lib/captures';
import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { EVENT_FRAME_OFFSET_MS } from '@/lib/frame';
import { ensureFarm } from '@/lib/farms';
import { createRingClient, describeRingError, ensureFreshAccessToken } from '@/lib/ring';
import { identifyAnimal, saveAnimalVerdict } from '@/lib/vision';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<NextResponse> {
  let body: { deviceId?: unknown }; try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: 'invalid_body', detail: 'Expected a JSON body.' }, { status: 400 }); }
  const ringDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''; if (ringDeviceId === '') return NextResponse.json({ error: 'device_required', detail: 'deviceId is required.' }, { status: 400 });
  const db = await getDb(); const config = loadConfig(); const farm = await ensureFarm(db, config);
  if (!farm) return NextResponse.json({ error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' }, { status: 409 });
  const device = await findCaptureDevice(db, farm.id, ringDeviceId);
  if (!device) return NextResponse.json({ error: 'unknown_device', detail: 'This camera is not stored yet - run a sync first.' }, { status: 404 });
  if (device.e2ee) return NextResponse.json({ error: 'e2ee_device', detail: 'This camera uses end-to-end encryption and cannot be captured.' }, { status: 409 });
  try {
    const { accessToken } = await ensureFreshAccessToken(db, config, farm.id); const client = createRingClient(config);
    const known = await listCapturedEventIds(db, farm.id); const historyEvents = await client.listHistoryEvents(accessToken, ringDeviceId, { maxPages: 1 });
    const fresh = historyEvents.filter((event) => event.startMs > 0 && !known.has(event.eventId));
    if (fresh.length === 0) return NextResponse.json({ status: 'no_new_events', scanned: historyEvents.length, capture: null, animal: null });
    const newest = fresh[fresh.length - 1]!; const snapshot = await client.fetchImageSnapshot(accessToken, ringDeviceId, { atMs: newest.startMs + EVENT_FRAME_OFFSET_MS });
    if (!snapshot) return NextResponse.json({ status: 'no_frame', scanned: historyEvents.length, capture: null, animal: null });
    const matchedEvent = await db.select({ id: eventRows.id }).from(eventRows).where(eq(eventRows.ringEventId, newest.eventId)).limit(1); const eventId = matchedEvent[0]?.id ?? null;
    const capture = await saveCapture(db, { bytes: snapshot.bytes, contentType: snapshot.contentType, capturedAt: new Date(newest.startMs), device, farmId: farm.id, eventId, ringEventId: newest.eventId, source: `event:${newest.eventId}` });
    if (eventId) await markCapturePending(db, eventId, capture.id);
    const existing = eventId ? await getDetectionForEvent(db, eventId) : null; const alreadyChecked = existing !== null && existing.status !== 'pending';
    const animal = alreadyChecked ? null : await identifyAnimal({ bytes: snapshot.bytes, contentType: snapshot.contentType, capturedAt: new Date(newest.startMs), eventId: newest.eventId });
    if (animal && eventId) await saveAnimalVerdict(db, eventId, capture.id, animal);
    return NextResponse.json({ status: 'captured', scanned: historyEvents.length, event: { id: newest.eventId, type: newest.eventType, subType: newest.subType, startMs: newest.startMs }, capture, animal });
  } catch (error) { const described = describeRingError(error, config); if (described) return NextResponse.json(described.body, { status: described.status }); throw error; }
}
