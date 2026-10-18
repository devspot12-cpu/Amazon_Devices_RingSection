import type { Db } from '@predator-guard/db';

import type { JobHandler } from './jobs';

/**
 * The queued pipeline's job handlers.
 *
 * M1 is intake, not analysis: `process_event` validates its payload and stops.
 * The milestone gate is "a simulated webhook leaves an `events` row" - the row
 * (and this job) are written synchronously at intake so Ring is acked in
 * milliseconds - and `drainJobs` runs the registered handlers out of band.
 *
 * M2/M3 grow these handlers, not the contract: media fetch (F4) and vision
 * (F5) then rules (F6) and alerts (F7) all hang off this envelope.
 */

export const PROCESS_EVENT_JOB = 'process_event';

export interface ProcessEventPayload {
  /** `events.id` - the row written at intake. */
  eventId: string;
  /** `events.ring_event_id` - Ring's own id, handy in logs. */
  ringEventId: string;
  /** Ring's `sub_type` (Stage 0 already dropped human/vehicle before enqueueing). */
  subType: string;
}

export function createJobHandlers(_deps: { db: Db }): Record<string, JobHandler> {
  return {
    [PROCESS_EVENT_JOB]: async (payload) => {
      const event = payload as Partial<ProcessEventPayload> | null;
      if (!event?.eventId) {
        throw new Error('process_event payload is missing eventId');
      }
      // M2: fetch media (F4), classify species (F5); M3: apply severity rules
      // (F6) and alert (F7). Until then the event row is the whole product.
    },
  };
}
