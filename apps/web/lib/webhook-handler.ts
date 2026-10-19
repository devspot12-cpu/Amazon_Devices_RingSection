import { and, eq } from 'drizzle-orm';

import { devices, events, type Db } from '@predator-guard/db';
import {
  shouldProcessEvent,
  toMotionEvent,
  verifyWebhookSignature,
  webhookEnvelopeSchema,
  type WebhookEnvelope,
} from '@predator-guard/ring';

import { findFarmByRingAccountId } from './farms';
import { enqueueJob } from './jobs';
import { PROCESS_EVENT_JOB, type ProcessEventPayload } from './pipeline';
import { unlinkRingAccount } from './ring';

/**
 * Webhook intake (FEATURES.md F2).
 *
 * The whole path lives here - signature check, parse, persist, enqueue - and
 * the Next route is a thin transport wrapper. That keeps the acceptance
 * criteria testable without spinning up a server, and means the demo/test
 * route (`/api/ring/webhook/test`) runs *exactly* this code on a simulator-
 * signed payload.
 *
 * Order matters: the raw bytes are verified before anything is parsed, so a
 * forged body is rejected (401) without the JSON parser ever seeing it.
 */

export interface WebhookDeps {
  db: Db;
  /** The HMAC signing key shared with Ring (hex webhooks - not the nonce encoding). */
  hmacKey: string;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Structured-log sink; defaults to one JSON line per event. */
  log?: (line: Record<string, unknown>) => void;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

const defaultLog = (line: Record<string, unknown>): void => {
  console.info(JSON.stringify(line));
};

/**
 * Handle one webhook delivery.
 *
 * Fast by construction: one signature check, a handful of indexed reads and an
 * insert (plus an insert into `jobs` for candidate events). No media fetch and
 * no vision - those run in `drainJobs` after the response.
 */
export async function handleWebhookRequest(
  rawBody: string | Buffer,
  signature: string | null,
  deps: WebhookDeps,
): Promise<WebhookResult> {
  const log = deps.log ?? defaultLog;

  // An unconfigured signing key would accept a signature anyone can compute.
  // Refuse instead: 503 so Ring retries once the key is set.
  if (!deps.hmacKey) {
    log({ stage: 'webhook.rejected', reason: 'signing_key_missing' });
    return { status: 503, body: { error: 'webhook_verification_unconfigured' } };
  }

  if (!signature || !verifyWebhookSignature(deps.hmacKey, rawBody, signature)) {
    log({ stage: 'webhook.rejected', reason: 'invalid_signature' });
    return { status: 401, body: { error: 'invalid_signature' } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'invalid_json' } };
  }

  const envelope = webhookEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    return { status: 400, body: { error: 'invalid_payload' } };
  }

  return dispatch(envelope.data, deps, log);
}

async function dispatch(
  envelope: WebhookEnvelope,
  deps: WebhookDeps,
  log: (line: Record<string, unknown>) => void,
): Promise<WebhookResult> {
  const { db } = deps;
  const now = deps.now ?? Date.now;
  const event = toMotionEvent(envelope);
  const eventType = envelope.data.type;

  // Associate with the farm and device when they are known. A webhook can
  // arrive before the first device sync - the event is still persisted.
  const farm = await findFarmByRingAccountId(db, event.accountId);
  let deviceRowId: string | null = null;
  if (farm && event.deviceId) {
    const rows = await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.farmId, farm.id), eq(devices.ringDeviceId, event.deviceId)))
      .limit(1);
    deviceRowId = rows[0]?.id ?? null;
  }

  // The unique indexes on ring_event_id / ring_request_id *are* the dedupe
  // (F2 criterion 2); a conflict means Ring redelivered something we have.
  const inserted = await db
    .insert(events)
    .values({
      farmId: farm?.id ?? null,
      deviceId: deviceRowId,
      ringDeviceId: event.deviceId,
      ringEventId: event.eventId,
      ringRequestId: event.requestId,
      eventType,
      eventClass: event.subType,
      occurredAt: new Date(event.timestamp || now()),
      rawJson: envelope,
    })
    .onConflictDoNothing()
    .returning({ id: events.id });

  const row = inserted[0];
  if (!row) {
    log({ stage: 'webhook.duplicate', eventType, ringEventId: event.eventId });
    return { status: 200, body: { received: true, duplicate: true } };
  }

  switch (eventType) {
    case 'motion_detected': {
      // Stage 0: the free gate. Everything except human/vehicle is enqueued -
      // including subtypes we have never seen (F2 criterion 4).
      const candidate = shouldProcessEvent(event.subType);
      if (candidate) {
        const payload: ProcessEventPayload = {
          eventId: row.id,
          ringEventId: event.eventId,
          subType: event.subType,
          componentIds: event.componentIds,
        };
        await enqueueJob(db, PROCESS_EVENT_JOB, payload);
      }
      log({
        stage: 'webhook.accepted',
        eventType,
        ringEventId: event.eventId,
        subType: event.subType,
        enqueued: candidate,
      });
      return { status: 200, body: { received: true, eventId: row.id, enqueued: candidate } };
    }

    case 'device_added':
    case 'device_removed':
    case 'device_online':
    case 'device_offline': {
      // F3 criterion 5: device lifecycle events move the stored state.
      const outcome = farm
        ? await applyDeviceState(db, farm.id, event.deviceId, eventType, now())
        : 'no_farm';
      log({ stage: 'webhook.accepted', eventType, ringDeviceId: event.deviceId, outcome });
      return { status: 200, body: { received: true, eventId: row.id, outcome } };
    }

    case 'app_integration_removed': {
      // F1 criterion 6: the farmer unlinked on Ring's side. Tokens go, and the
      // farm detaches from the account.
      await unlinkRingAccount(db, event.accountId);
      log({ stage: 'webhook.accepted', eventType, accountId: event.accountId, unlinked: true });
      return { status: 200, body: { received: true, eventId: row.id, unlinked: true } };
    }

    default: {
      // Unknown event types are persisted for replay and otherwise ignored.
      log({ stage: 'webhook.accepted', eventType, ignored: true });
      return { status: 200, body: { received: true, eventId: row.id, ignored: true } };
    }
  }
}

/**
 * Apply one device-state transition. `device_added` creates a conservative
 * offline row (the webhook carries no metadata; the F3 sync fills name,
 * capabilities and real online state); `device_removed` deletes - the device
 * is gone from the account. Events keep their history either way
 * (`events.device_id` is `ON DELETE SET NULL`).
 */
async function applyDeviceState(
  db: Db,
  farmId: string,
  ringDeviceId: string,
  eventType: string,
  nowMs: number,
): Promise<string> {
  if (!ringDeviceId) return 'no_device_id';

  switch (eventType) {
    case 'device_added': {
      await db
        .insert(devices)
        .values({ farmId, ringDeviceId, name: '', online: false })
        .onConflictDoNothing({ target: [devices.farmId, devices.ringDeviceId] });
      return 'added';
    }
    case 'device_online': {
      await db
        .update(devices)
        .set({ online: true, lastSeenAt: new Date(nowMs), updatedAt: new Date(nowMs) })
        .where(and(eq(devices.farmId, farmId), eq(devices.ringDeviceId, ringDeviceId)));
      return 'online';
    }
    case 'device_offline': {
      await db
        .update(devices)
        .set({ online: false, updatedAt: new Date(nowMs) })
        .where(and(eq(devices.farmId, farmId), eq(devices.ringDeviceId, ringDeviceId)));
      return 'offline';
    }
    case 'device_removed': {
      await db
        .delete(devices)
        .where(and(eq(devices.farmId, farmId), eq(devices.ringDeviceId, ringDeviceId)));
      return 'removed';
    }
    default:
      return 'ignored';
  }
}
