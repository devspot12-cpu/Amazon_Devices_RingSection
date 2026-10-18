import { verifyWebhookSignature } from '@predator-guard/ring';
import { describe, expect, it } from 'vitest';

import {
  buildAppIntegrationRemovedWebhook,
  buildDeviceStateWebhook,
  buildMotionWebhook,
  sendWebhook,
  signWebhookPayload,
} from './webhook-sender.js';

const KEY = 'sim-hmac-key';

describe('signed webhook payloads', () => {
  it('builds a v1.1 motion envelope whose signature verifies over the raw body', () => {
    const built = buildMotionWebhook({
      accountId: 'acct-1',
      deviceId: 'cam-coop',
      subType: 'motion',
      timestamp: 1_787_000_000_000,
      componentIds: ['0'],
    });
    const signature = signWebhookPayload(KEY, built.rawBody);

    expect(verifyWebhookSignature(KEY, built.rawBody, signature)).toBe(true);
    expect(verifyWebhookSignature(KEY, built.rawBody + ' ', signature)).toBe(false);
    expect(verifyWebhookSignature('other-key', built.rawBody, signature)).toBe(false);

    const envelope = built.envelope as {
      meta: Record<string, unknown>;
      data: { type: string; attributes: Record<string, unknown> };
    };
    expect(envelope.meta.account_id).toBe('acct-1');
    expect(envelope.meta.request_id).toMatch(/[0-9a-f-]{36}/);
    expect(envelope.data.type).toBe('motion_detected');
    expect(envelope.data.attributes.source).toBe('cam-coop');
    expect(envelope.data.attributes.sub_type).toBe('motion');
    expect(envelope.data.attributes.component_ids).toEqual(['0']);
  });

  it('defaults the subtype and honours explicit ids', () => {
    const built = buildMotionWebhook({
      accountId: 'acct-1',
      deviceId: 'cam-yard',
      eventId: 'evt-fixed',
      requestId: 'req-fixed',
    });
    const envelope = built.envelope as {
      meta: Record<string, unknown>;
      data: { id: string; attributes: Record<string, unknown> };
    };
    expect(envelope.data.id).toBe('evt-fixed');
    expect(envelope.meta.request_id).toBe('req-fixed');
    expect(envelope.data.attributes.sub_type).toBe('motion');
  });

  it('builds device state and integration-removed events', () => {
    const device = buildDeviceStateWebhook({
      accountId: 'acct-1',
      deviceId: 'cam-shed',
      state: 'offline',
    }).envelope as { data: { type: string; attributes: Record<string, unknown> } };
    expect(device.data.type).toBe('device_offline');
    expect(device.data.attributes.source).toBe('cam-shed');

    const removed = buildAppIntegrationRemovedWebhook({ accountId: 'acct-1' }).envelope as {
      data: { type: string; attributes: Record<string, unknown> };
    };
    expect(removed.data.type).toBe('app_integration_removed');
    expect(removed.data.attributes.account_id).toBe('acct-1');
  });

  it('POSTs the signed body with an X-Signature header', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const built = buildMotionWebhook({ accountId: 'acct-1', deviceId: 'cam-coop' });
    const result = await sendWebhook({
      url: 'http://app.test/api/ring/webhook',
      hmacKey: KEY,
      payload: built,
      fetchImpl,
    });

    expect(result.status).toBe(200);
    expect(result.bodyText).toBe('{"received":true}');
    const call = calls[0]!;
    expect(call.init.method).toBe('POST');
    const headers = call.init.headers as Record<string, string>;
    expect(verifyWebhookSignature(KEY, String(call.init.body), headers['x-signature']!)).toBe(true);
  });
});
