import { z } from 'zod';

import type { MotionEvent } from './types.js';

/**
 * A Ring webhook, version 1.1.
 *
 * Unknown fields are allowed (`.passthrough()`) on purpose: Ring adds fields over time
 * and a stricter schema would start rejecting valid payloads after a Ring release.
 */
export const webhookEnvelopeSchema = z.object({
  meta: z.object({
    version: z.string(),
    time: z.string(),
    request_id: z.string(),
    account_id: z.string(),
  }),
  data: z.object({
    id: z.string(),
    type: z.string(),
    attributes: z
      .object({
        source: z.string(),
        source_type: z.string(),
        timestamp: z.number(),
        timestamp_readable: z.string().optional(),
        sub_type: z.string().optional(),
        component_ids: z.array(z.string()).optional(),
      })
      .passthrough(),
  }),
});

export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

/**
 * Subtypes we are confident cannot contain a predator, so we can skip the expensive
 * media + vision path for free.
 *
 * Everything else - including values we have never seen - is processed. Ring's subtype
 * vocabulary is open-ended and grows, so a hard-coded allow-list would silently drop
 * real events.
 */
const SKIP_SUBTYPES: ReadonlySet<string> = new Set(['human', 'vehicle']);

/**
 * Stage 0 of the CV funnel, the free gate.
 *
 * Returns true when the event is worth downloading media and running vision on.
 */
export function shouldProcessEvent(subType: string): boolean {
  return !SKIP_SUBTYPES.has(subType);
}

/** Normalise the raw envelope into the shape the rest of the pipeline uses. */
export function toMotionEvent(envelope: WebhookEnvelope): MotionEvent {
  const attributes = envelope.data.attributes;
  return {
    requestId: envelope.meta.request_id,
    accountId: envelope.meta.account_id,
    deviceId: attributes.source,
    eventId: envelope.data.id,
    timestamp: attributes.timestamp,
    subType: attributes.sub_type ?? 'unknown',
    componentIds: attributes.component_ids ?? [],
  };
}
