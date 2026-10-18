import { createHmac, randomUUID } from 'node:crypto';

/**
 * Webhook construction and delivery for the simulator (FEATURES.md F2/F10).
 *
 * The fake Ring API and the real one sign identically: `X-Signature:
 * sha256=<hex>` over the **raw body bytes**. The sender here builds the v1.1
 * envelope, signs it, and POSTs it - which is how the dev demo drives the
 * whole intake path without Ring, and how the tests exercise the exact
 * signature verification the production route uses.
 */

export interface MotionWebhookInput {
  accountId: string;
  deviceId: string;
  /** Ring's `sub_type`; defaults to `motion`. */
  subType?: string;
  timestamp?: number;
  eventId?: string;
  requestId?: string;
  componentIds?: string[];
}

export interface DeviceStateWebhookInput {
  accountId: string;
  deviceId: string;
  state: 'added' | 'removed' | 'online' | 'offline';
  timestamp?: number;
  eventId?: string;
  requestId?: string;
}

export interface IntegrationWebhookInput {
  accountId: string;
  timestamp?: number;
  requestId?: string;
}

/** A v1.1 webhook body, serialised once - the bytes that get signed. */
export interface BuiltWebhook {
  rawBody: string;
  envelope: Record<string, unknown>;
}

function meta(accountId: string, timestamp: number, requestId?: string): Record<string, unknown> {
  return {
    version: '1.1',
    time: new Date(timestamp).toISOString(),
    request_id: requestId ?? randomUUID(),
    account_id: accountId,
  };
}

function readable(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

export function buildMotionWebhook(input: MotionWebhookInput): BuiltWebhook {
  const timestamp = input.timestamp ?? Date.now();
  const envelope = {
    meta: meta(input.accountId, timestamp, input.requestId),
    data: {
      id: input.eventId ?? `${input.deviceId}_motion_${timestamp}`,
      type: 'motion_detected',
      attributes: {
        source: input.deviceId,
        source_type: 'devices',
        timestamp,
        timestamp_readable: readable(timestamp),
        sub_type: input.subType ?? 'motion',
        component_ids: input.componentIds ?? [],
      },
    },
  };
  return { envelope, rawBody: JSON.stringify(envelope) };
}

export function buildAppIntegrationRemovedWebhook(input: IntegrationWebhookInput): BuiltWebhook {
  const timestamp = input.timestamp ?? Date.now();
  const envelope = {
    meta: meta(input.accountId, timestamp, input.requestId),
    data: {
      id: `${input.accountId}_app_integration_removed_${timestamp}`,
      type: 'app_integration_removed',
      attributes: {
        account_id: input.accountId,
        timestamp,
        timestamp_readable: readable(timestamp),
      },
    },
  };
  return { envelope, rawBody: JSON.stringify(envelope) };
}

export function buildDeviceStateWebhook(input: DeviceStateWebhookInput): BuiltWebhook {
  const timestamp = input.timestamp ?? Date.now();
  const envelope = {
    meta: meta(input.accountId, timestamp, input.requestId),
    data: {
      id: input.eventId ?? `${input.deviceId}_device_${input.state}_${timestamp}`,
      type: `device_${input.state}`,
      attributes: {
        source: input.deviceId,
        source_type: 'devices',
        timestamp,
        timestamp_readable: readable(timestamp),
      },
    },
  };
  return { envelope, rawBody: JSON.stringify(envelope) };
}

/** `sha256=<hex>` over the raw body - exactly what Ring sends. */
export function signWebhookPayload(hmacKey: string, rawBody: string | Buffer): string {
  const digest = createHmac('sha256', hmacKey).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

export interface SendWebhookResult {
  status: number;
  bodyText: string;
}

/** Sign and POST a built webhook to a receiver (our own route in demos). */
export async function sendWebhook(options: {
  url: string;
  hmacKey: string;
  payload: BuiltWebhook;
  fetchImpl?: typeof fetch;
}): Promise<SendWebhookResult> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const response = await fetchImpl(options.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-signature': signWebhookPayload(options.hmacKey, options.payload.rawBody),
    },
    body: options.payload.rawBody,
  });
  return { status: response.status, bodyText: await response.text() };
}
