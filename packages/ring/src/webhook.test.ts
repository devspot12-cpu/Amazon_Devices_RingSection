import { describe, expect, it } from 'vitest';

import { shouldProcessEvent, toMotionEvent, webhookEnvelopeSchema } from './webhook.js';

/** A real-shaped v1.1 motion payload from the Ring docs. */
const motionPayload = {
  meta: {
    version: '1.1',
    time: '2026-02-13T13:39:57.200155525Z',
    request_id: '2ad45ade-1818-4154-813b-afdd8bcd8085',
    account_id: 'ava1.ring.account.XXXYYY',
  },
  data: {
    id: 'dev-1_motion_1786715596787',
    type: 'motion_detected',
    attributes: {
      source: 'dev-1',
      source_type: 'devices',
      timestamp: 1786715596787,
      timestamp_readable: '2026-08-14 08:53:16',
      sub_type: 'motion',
      component_ids: ['0'],
    },
  },
};

describe('webhookEnvelopeSchema', () => {
  it('parses a v1.1 motion payload and normalises it', () => {
    const event = toMotionEvent(webhookEnvelopeSchema.parse(motionPayload));
    expect(event.deviceId).toBe('dev-1');
    expect(event.accountId).toBe('ava1.ring.account.XXXYYY');
    expect(event.subType).toBe('motion');
    expect(event.componentIds).toEqual(['0']);
    expect(event.requestId).toBe('2ad45ade-1818-4154-813b-afdd8bcd8085');
  });

  it('tolerates unknown fields Ring may add later', () => {
    const withExtras = {
      ...motionPayload,
      data: { ...motionPayload.data, attributes: { ...motionPayload.data.attributes, shiny_new_field: 42 } },
      extra_top_level: true,
    };
    expect(() => webhookEnvelopeSchema.parse(withExtras)).not.toThrow();
  });

  it('defaults sub_type to "unknown" and component_ids to [] when Ring omits them', () => {
    const minimal = {
      meta: motionPayload.meta,
      data: {
        id: 'dev-2_motion_1',
        type: 'motion_detected',
        attributes: { source: 'dev-2', source_type: 'devices', timestamp: 1 },
      },
    };
    const event = toMotionEvent(webhookEnvelopeSchema.parse(minimal));
    expect(event.subType).toBe('unknown');
    expect(event.componentIds).toEqual([]);
  });

  it('rejects a payload that is missing required fields', () => {
    expect(() => webhookEnvelopeSchema.parse({ meta: {}, data: {} })).toThrow();
  });

  it('parses non-motion events that omit source and timestamp', () => {
    const integrationRemoved = {
      meta: {
        version: '1.1',
        time: '2026-02-13T13:40:00Z',
        request_id: 'req-int-1',
        account_id: 'ava1.ring.account.XXXYYY',
      },
      data: {
        id: 'int-1',
        type: 'app_integration_removed',
        attributes: { source_type: 'app_integrations' },
      },
    };
    const event = toMotionEvent(webhookEnvelopeSchema.parse(integrationRemoved));
    expect(event.deviceId).toBe('');
    expect(event.timestamp).toBe(0);
    expect(event.subType).toBe('unknown');
  });
});

describe('shouldProcessEvent - the Stage 0 free gate', () => {
  it('drops subtypes that cannot contain a predator', () => {
    expect(shouldProcessEvent('human')).toBe(false);
    expect(shouldProcessEvent('vehicle')).toBe(false);
  });

  it('processes motion, other_motion and package_delivery', () => {
    expect(shouldProcessEvent('motion')).toBe(true);
    expect(shouldProcessEvent('other_motion')).toBe(true);
    expect(shouldProcessEvent('package_delivery')).toBe(true);
  });

  it('processes unknown and future subtype values rather than dropping them', () => {
    for (const value of ['animal', 'wildlife', 'some_future_ring_value', '']) {
      expect(shouldProcessEvent(value)).toBe(true);
    }
  });
});
