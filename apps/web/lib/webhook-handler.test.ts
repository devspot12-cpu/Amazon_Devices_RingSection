import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, ne } from 'drizzle-orm';

import {
  captures,
  createDb,
  detections,
  devices,
  events,
  farms,
  jobs,
  ringTokens,
  type Db,
} from '@predator-guard/db';
import {
  encryptToken,
  parseTokenEncKey,
} from '@predator-guard/ring';
import {
  SIM_ACCOUNT_ID,
  SIM_DEVICES,
  buildAppIntegrationRemovedWebhook,
  buildDeviceStateWebhook,
  buildMotionWebhook,
  signWebhookPayload,
  type BuiltWebhook,
} from '@predator-guard/sim';

import { loadConfig } from './config';
import { createFarm } from './farms';
import { MAX_JOB_ATTEMPTS, drainJobs } from './jobs';
import { PROCESS_EVENT_JOB, createJobHandlers } from './pipeline';
import { handleWebhookRequest, type WebhookDeps } from './webhook-handler';

/**
 * The M1 gate: "simulate a signed webhook -> an `events` row appears".
 *
 * Everything runs against a real (PGlite) database through the same
 * `handleWebhookRequest` the route calls - the only difference from
 * production is where the bytes come from.
 */

let db: Db;
let closeDb: () => Promise<void>;
const config = loadConfig({ NODE_ENV: 'test' });

const deps = (): WebhookDeps => ({
  db,
  hmacKey: config.hmacKey,
  log: () => {
    // Quiet: the JSON log lines are for production, not for test output.
  },
});

/** Deliver a built webhook exactly like the route does: signed raw bytes. */
function send(built: BuiltWebhook, hmacKey: string = config.hmacKey) {
  return handleWebhookRequest(
    Buffer.from(built.rawBody),
    signWebhookPayload(hmacKey, built.rawBody),
    deps(),
  );
}

async function countRows(table: typeof events | typeof jobs | typeof ringTokens): Promise<number> {
  return (await db.select({ id: table.id }).from(table)).length;
}

beforeAll(async () => {
  const opened = await createDb({ pgliteDataDir: 'memory://' });
  db = opened.db;
  closeDb = opened.close;
});

afterAll(async () => {
  await closeDb();
});

describe('webhook intake - the M1 gate', () => {
  it('accepts a signed motion webhook and lands one events row, linked to the farm', async () => {
    const farm = await createFarm(db, {
      name: 'Gate Farm',
      ownerEmail: 'gate@example.test',
      ringAccountId: SIM_ACCOUNT_ID,
    });
    await db.insert(devices).values({
      farmId: farm.id,
      ringDeviceId: SIM_DEVICES.coop,
      name: 'Coop camera',
    });
    const built = buildMotionWebhook({
      accountId: SIM_ACCOUNT_ID,
      deviceId: SIM_DEVICES.coop,
      subType: 'motion',
      eventId: 'gate-evt-1',
      requestId: 'gate-req-1',
    });

    const result = await send(built);

    expect(result.status).toBe(200);
    expect(result.body.received).toBe(true);
    expect(result.body.enqueued).toBe(true);

    const rows = await db.select().from(events).where(eq(events.ringEventId, 'gate-evt-1'));
    expect(rows).toHaveLength(1);
    const event = rows[0]!;
    expect(event.farmId).toBe(farm.id);
    expect(event.ringRequestId).toBe('gate-req-1');
    expect(event.eventClass).toBe('motion');
    expect(event.rawJson).toBeTruthy();

    // The expensive work is queued, not done inline.
    const jobRows = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.kind, PROCESS_EVENT_JOB), eq(jobs.status, 'pending')));
    expect(jobRows).toHaveLength(1);
    expect((jobRows[0]!.payload as { eventId: string }).eventId).toBe(event.id);
  });

  it('treats a redelivered request_id as a duplicate: 200, no second row, no second job', async () => {
    const built = buildMotionWebhook({
      accountId: SIM_ACCOUNT_ID,
      deviceId: SIM_DEVICES.coop,
      subType: 'motion',
      eventId: 'gate-evt-2',
      requestId: 'gate-req-2',
    });
    await send(built);

    const eventsBefore = await countRows(events);
    const jobsBefore = await countRows(jobs);

    const again = await send(built);

    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await countRows(events)).toBe(eventsBefore);
    expect(await countRows(jobs)).toBe(jobsBefore);
  });

  it('rejects a forged signature with 401 before parsing, and persists nothing', async () => {
    const built = buildMotionWebhook({
      accountId: SIM_ACCOUNT_ID,
      deviceId: SIM_DEVICES.pasture,
      eventId: 'forged-evt-1',
      requestId: 'forged-req-1',
    });
    const eventsBefore = await countRows(events);

    const result = await handleWebhookRequest(
      Buffer.from(built.rawBody),
      signWebhookPayload('wrong-key', built.rawBody),
      deps(),
    );

    expect(result.status).toBe(401);
    expect(await countRows(events)).toBe(eventsBefore);
  });

  it('refuses to verify at all when no signing key is configured (503, not a forgeable pass)', async () => {
    const built = buildMotionWebhook({
      accountId: SIM_ACCOUNT_ID,
      deviceId: SIM_DEVICES.pasture,
      eventId: 'nokey-evt-1',
      requestId: 'nokey-req-1',
    });
    const eventsBefore = await countRows(events);

    const result = await handleWebhookRequest(
      Buffer.from(built.rawBody),
      signWebhookPayload('', built.rawBody),
      { ...deps(), hmacKey: '' },
    );

    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'webhook_verification_unconfigured' });
    expect(await countRows(events)).toBe(eventsBefore);
  });

  it('persists human events but never enqueues them (Stage 0 drop)', async () => {
    const built = buildMotionWebhook({
      accountId: SIM_ACCOUNT_ID,
      deviceId: SIM_DEVICES.yard,
      subType: 'human',
      eventId: 'human-evt-1',
      requestId: 'human-req-1',
    });
    const jobsBefore = await countRows(jobs);

    const result = await send(built);

    expect(result.status).toBe(200);
    expect(result.body.enqueued).toBe(false);
    expect(await countRows(jobs)).toBe(jobsBefore);
    const rows = await db.select().from(events).where(eq(events.ringEventId, 'human-evt-1'));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventClass).toBe('human');
  });

  it('persists unknown event types for replay and ignores them otherwise', async () => {
    const raw = JSON.stringify({
      meta: {
        version: '1.1',
        time: new Date().toISOString(),
        request_id: 'future-req-1',
        account_id: SIM_ACCOUNT_ID,
      },
      data: { id: 'future-evt-1', type: 'some_future_ring_event', attributes: {} },
    });

    const result = await handleWebhookRequest(
      Buffer.from(raw),
      signWebhookPayload(config.hmacKey, raw),
      deps(),
    );

    expect(result.status).toBe(200);
    expect(result.body.ignored).toBe(true);
    const rows = await db.select().from(events).where(eq(events.ringEventId, 'future-evt-1'));
    expect(rows).toHaveLength(1);
  });

  it('answers signed but unparseable bodies with 400', async () => {
    for (const raw of ['not json', JSON.stringify({ unexpected: true })]) {
      const result = await handleWebhookRequest(
        Buffer.from(raw),
        signWebhookPayload(config.hmacKey, raw),
        deps(),
      );
      expect(result.status).toBe(400);
    }
  });

  it('drains queued work out of band: process_event completes the job', async () => {
    const farm = await createFarm(db, {
      name: 'Capture Farm',
      ownerEmail: 'capture@example.test',
      ringAccountId: 'sim-account-capture',
    });
    await db.insert(devices).values({
      farmId: farm.id,
      ringDeviceId: SIM_DEVICES.shed,
      name: 'Shed camera',
    });
    await send(
      buildMotionWebhook({
        accountId: 'sim-account-capture',
        deviceId: SIM_DEVICES.shed,
        subType: 'motion',
        eventId: 'drain-evt-capture',
        requestId: 'drain-req-capture',
      }),
    );

    const processed = await drainJobs(db, {
      handlers: createJobHandlers({
        db,
        config,
        fetchSnapshot: async () => ({
          bytes: new Uint8Array([0xff, 0xd8, 0xff]),
          contentType: 'image/jpeg',
          capturedAt: null,
          origin: 'recording',
          requestId: null,
        }),
      }),
    });

    expect(processed).toBeGreaterThanOrEqual(1);
    const pendingJobs = await db.select().from(jobs).where(eq(jobs.status, 'pending'));
    expect(pendingJobs).toHaveLength(0);
    const done = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.kind, PROCESS_EVENT_JOB), eq(jobs.status, 'done')));
    expect(done.length).toBeGreaterThanOrEqual(1);
    const event = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.ringEventId, 'drain-evt-capture'));
    const saved = await db
      .select()
      .from(captures)
      .where(eq(captures.ringEventId, 'drain-evt-capture'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      farmId: farm.id,
      ringDeviceId: SIM_DEVICES.shed,
      deviceName: 'Shed camera',
      zoneKind: null,
      source: 'event:drain-evt-capture',
      contentType: 'image/jpeg',
    });
    const detectionRows = await db
      .select()
      .from(detections)
      .where(eq(detections.eventId, event[0]!.id));
    expect(detectionRows).toHaveLength(1);
    expect(detectionRows[0]).toMatchObject({ species: 'unknown', status: 'pending' });
  });
});

describe('webhook intake - device and integration lifecycle', () => {
  it('moves device state: offline, then online', async () => {
    const farm = await createFarm(db, {
      name: 'Device Farm',
      ownerEmail: 'devices@example.test',
      ringAccountId: 'sim-account-devices',
    });
    const inserted = await db
      .insert(devices)
      .values({ farmId: farm.id, ringDeviceId: SIM_DEVICES.yard, name: 'Yard', online: true })
      .returning({ id: devices.id });
    const deviceId = inserted[0]!.id;

    await send(
      buildDeviceStateWebhook({
        accountId: 'sim-account-devices',
        deviceId: SIM_DEVICES.yard,
        state: 'offline',
        eventId: 'dev-off-1',
        requestId: 'dev-off-req-1',
      }),
    );
    let row = (await db.select().from(devices).where(eq(devices.id, deviceId)))[0]!;
    expect(row.online).toBe(false);

    await send(
      buildDeviceStateWebhook({
        accountId: 'sim-account-devices',
        deviceId: SIM_DEVICES.yard,
        state: 'online',
        eventId: 'dev-on-1',
        requestId: 'dev-on-req-1',
      }),
    );
    row = (await db.select().from(devices).where(eq(devices.id, deviceId)))[0]!;
    expect(row.online).toBe(true);
  });

  it('device_added creates a row; device_removed deletes it', async () => {
    const farm = await createFarm(db, {
      name: 'Lifecycle Farm',
      ownerEmail: 'lifecycle@example.test',
      ringAccountId: 'sim-account-lifecycle',
    });

    await send(
      buildDeviceStateWebhook({
        accountId: 'sim-account-lifecycle',
        deviceId: SIM_DEVICES.shed,
        state: 'added',
        eventId: 'dev-add-1',
        requestId: 'dev-add-req-1',
      }),
    );
    const added = await db
      .select()
      .from(devices)
      .where(and(eq(devices.farmId, farm.id), eq(devices.ringDeviceId, SIM_DEVICES.shed)));
    expect(added).toHaveLength(1);

    await send(
      buildDeviceStateWebhook({
        accountId: 'sim-account-lifecycle',
        deviceId: SIM_DEVICES.shed,
        state: 'removed',
        eventId: 'dev-rm-1',
        requestId: 'dev-rm-req-1',
      }),
    );
    const removed = await db
      .select()
      .from(devices)
      .where(and(eq(devices.farmId, farm.id), eq(devices.ringDeviceId, SIM_DEVICES.shed)));
    expect(removed).toHaveLength(0);
  });

  it('app_integration_removed deletes the tokens and detaches the farm', async () => {
    const accountId = 'sim-account-unlink';
    const farm = await createFarm(db, {
      name: 'Unlink Farm',
      ownerEmail: 'unlink@example.test',
      ringAccountId: accountId,
    });
    const key = parseTokenEncKey(config.tokenEncKey);
    await db.insert(ringTokens).values({
      farmId: farm.id,
      ringAccountId: accountId,
      status: 'claimed',
      accessEnc: encryptToken('access-token-value', key),
      refreshEnc: encryptToken('refresh-token-value', key),
    });

    const result = await send(
      buildAppIntegrationRemovedWebhook({
        accountId,
        timestamp: 1_790_000_000_000,
        requestId: 'unlink-req-1',
      }),
    );

    expect(result.status).toBe(200);
    expect(result.body.unlinked).toBe(true);
    const tokens = await db.select().from(ringTokens).where(eq(ringTokens.ringAccountId, accountId));
    expect(tokens).toHaveLength(0);
    const farmRow = (await db.select().from(farms).where(eq(farms.id, farm.id)))[0]!;
    expect(farmRow.ringAccountId).toBeNull();
  });
});

describe('job queue', () => {
  it('retries a throwing handler with backoff, then fails it after MAX_JOB_ATTEMPTS', async () => {
    const failing = {
      explode: async () => {
        throw new Error('boom');
      },
    };
    await db.insert(jobs).values({ kind: 'explode', payload: {} });

    for (let attempt = 1; attempt <= MAX_JOB_ATTEMPTS; attempt += 1) {
      // Make the job due again - backoff pushes run_at into the future by design.
      await db
        .update(jobs)
        .set({ runAt: new Date(Date.now() - 1000) })
        .where(and(eq(jobs.kind, 'explode'), ne(jobs.status, 'done')));
      await drainJobs(db, { handlers: failing, max: 5 });
    }

    const row = (await db.select().from(jobs).where(eq(jobs.kind, 'explode')))[0]!;
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(MAX_JOB_ATTEMPTS);
    expect(row.lastError).toBe('boom');
  });
});
