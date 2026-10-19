import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { alerts, createDb, detections, events, farms, type Db } from '@predator-guard/db';

import { listCapturedEventIds, listCaptures, readCaptureImage, saveCapture } from './captures';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const DEVICE = {
  ringDeviceId: 'ava1.ring.device.A',
  name: 'Coop cam',
  zoneKind: 'coop',
  e2ee: false,
};

describe('database capture storage', () => {
  let db: Db;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const opened = await createDb({ pgliteDataDir: 'memory://' });
    db = opened.db;
    closeDb = opened.close;
  });

  afterAll(async () => {
    await closeDb();
  });

  async function createFarm(): Promise<string> {
    const rows = await db
      .insert(farms)
      .values({ name: 'Capture Farm', ownerEmail: `${randomUUID()}@example.test` })
      .returning({ id: farms.id });
    return rows[0]!.id;
  }

  it('stores image bytes and metadata in Postgres, newest first', async () => {
    const farmId = await createFarm();
    const [event] = await db
      .insert(events)
      .values({
        farmId,
        ringDeviceId: DEVICE.ringDeviceId,
        ringEventId: 'event-1',
        ringRequestId: 'request-1',
        eventType: 'motion_detected',
        eventClass: 'motion.animal',
        occurredAt: new Date('2026-10-19T03:00:00.000Z'),
        rawJson: {},
      })
      .returning({ id: events.id });
    const first = await saveCapture(db, {
      bytes: JPEG,
      contentType: 'image/jpeg',
      capturedAt: new Date('2026-10-19T02:00:00.000Z'),
      device: DEVICE,
      farmId,
      source: 'manual',
    });
    const second = await saveCapture(db, {
      bytes: JPEG,
      contentType: 'image/jpeg',
      capturedAt: new Date('2026-10-19T03:00:00.000Z'),
      device: DEVICE,
      farmId,
      eventId: event!.id,
      ringEventId: 'event-1',
      source: 'event:event-1',
    });
    const [detection] = await db
      .insert(detections)
      .values({ eventId: event!.id, species: 'fox', confidence: 0.94, status: 'done' })
      .returning({ id: detections.id });
    await db.insert(alerts).values({
      detectionId: detection!.id,
      severity: 'high',
      channel: 'console',
    });

    const image = await readCaptureImage(db, first.id);
    expect([...image!.bytes]).toEqual([...JPEG]);

    const listed = await listCaptures(db, farmId);
    expect(listed.map((record) => record.id)).toEqual([second.id, first.id]);
    expect(await listCapturedEventIds(db, farmId)).toEqual(new Set(['event-1']));
    expect(listed[0]).toMatchObject({
      species: 'fox',
      confidence: 0.94,
      detectionStatus: 'done',
      severity: 'high',
    });
    expect(listed[1]).toMatchObject({
      deviceName: 'Coop cam',
      zoneKind: 'coop',
      capturedAt: '2026-10-19T02:00:00.000Z',
      bytes: JPEG.byteLength,
      source: 'manual',
    });
  });

  it('returns no captures and no image for unknown records', async () => {
    const farmId = await createFarm();
    await expect(listCaptures(db, farmId)).resolves.toEqual([]);
    await expect(readCaptureImage(db, randomUUID())).resolves.toBeNull();
  });

  it('deduplicates event captures by Ring event id', async () => {
    const farmId = await createFarm();
    const input = {
      bytes: JPEG,
      contentType: 'image/jpeg' as const,
      capturedAt: new Date('2026-10-19T02:00:00.000Z'),
      device: DEVICE,
      farmId,
      ringEventId: 'dedup-event',
      source: 'event:dedup-event',
    };

    const first = await saveCapture(db, input);
    const duplicate = await saveCapture(db, input);

    expect(duplicate.id).toBe(first.id);
    expect(await listCaptures(db, farmId)).toHaveLength(1);
  });
});
