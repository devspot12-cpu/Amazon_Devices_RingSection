import { SIM_DEVICES } from './fake-ring.js';
import { buildMotionWebhook, type BuiltWebhook } from './webhook-sender.js';

/**
 * The planted-stories event generator (FEATURES.md F10 criteria 1-2, PLAN.md S10).
 *
 * Produces a deterministic 14-day stream of raw Ring-style motion events:
 *
 * | Story | Planted as |
 * | --- | --- |
 * | A | fox at the coop, 02:00-04:00, on 3 of 5 weeknights (Mon/Wed/Fri) |
 * | B | coyote walking the pasture fence, both weekend days ("two weekends") |
 * | C | raccoon at the feed shed every evening after feeding (19:00) |
 * | herring | the farm's own dog crossing the yard at 18:00 daily |
 *
 * Deterministic on purpose: the "brain" tests (stories found, red herring
 * ignored) and the demo replay must produce identical input every run. Times
 * are local, because the rules engine's night/day split is local too.
 */

export type PlantedStory =
  | 'fox-at-coop'
  | 'coyote-at-pasture'
  | 'raccoon-at-shed'
  | 'herring-dog-in-yard';

export interface SimulatedEvent {
  /** Which planted pattern this event belongs to - what the tests assert on. */
  story: PlantedStory;
  deviceId: string;
  occurredAt: Date;
  /** v1.1 webhook body, ready to sign (signWebhookPayload) and POST. */
  webhook: BuiltWebhook;
}

export interface GenerateSimWindowOptions {
  /** Local midnight of day 0. Defaults to `days - 1` days before today. */
  start?: Date;
  days?: number;
  accountId?: string;
}

export const SIM_WINDOW_DAYS = 14;
export const DEFAULT_SIM_ACCOUNT_ID = 'sim-account-1';

/** Weeknights the fox visits: Monday, Wednesday, Friday (3 of 5). */
const FOX_WEEKDAYS = new Set([1, 3, 5]);

function atLocal(start: Date, dayOffset: number, hour: number, minute: number): Date {
  return new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  );
}

function defaultStart(days: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
}

interface PlantedOccurrence {
  story: PlantedStory;
  deviceId: string;
  dayOffset: number;
  hour: number;
  minute: number;
}

/** The deterministic schedule - one place that defines every story's rhythm. */
function occurrencesFor(start: Date, days: number): PlantedOccurrence[] {
  const occurrences: PlantedOccurrence[] = [];
  for (let day = 0; day < days; day += 1) {
    const weekday = atLocal(start, day, 12, 0).getDay(); // noon: DST-proof weekday read

    // Red herring: the farm's own dog, every day at 18:00.
    occurrences.push({
      story: 'herring-dog-in-yard',
      deviceId: SIM_DEVICES.yard,
      dayOffset: day,
      hour: 18,
      minute: 0,
    });

    // Story C: raccoon at the feed shed, every evening after feeding.
    occurrences.push({
      story: 'raccoon-at-shed',
      deviceId: SIM_DEVICES.shed,
      dayOffset: day,
      hour: 19,
      minute: (day % 3) * 7,
    });

    // Story A: fox at the coop, 02:00-04:00, on three of five weeknights.
    if (FOX_WEEKDAYS.has(weekday)) {
      occurrences.push({
        story: 'fox-at-coop',
        deviceId: SIM_DEVICES.coop,
        dayOffset: day,
        hour: 3,
        minute: (day % 2) * 20,
      });
    }

    // Story B: coyote along the pasture fence, weekends.
    if (weekday === 0 || weekday === 6) {
      occurrences.push({
        story: 'coyote-at-pasture',
        deviceId: SIM_DEVICES.pasture,
        dayOffset: day,
        hour: 5,
        minute: 30,
      });
    }
  }
  // Stable ordering: chronological, then story name for same-timestamp ties.
  occurrences.sort(
    (a, b) => a.dayOffset - b.dayOffset || a.hour - b.hour || a.minute - b.minute,
  );
  return occurrences;
}

/**
 * Generate the window. Events are precise motion webhooks for the sim cameras;
 * which animal each one "contains" is the story label - species come from the
 * vision stage in the real pipeline, exactly as Ring demands.
 */
export function generateSimWindow(options: GenerateSimWindowOptions = {}): SimulatedEvent[] {
  const days = options.days ?? SIM_WINDOW_DAYS;
  const start = options.start ?? defaultStart(days);
  const accountId = options.accountId ?? DEFAULT_SIM_ACCOUNT_ID;

  return occurrencesFor(start, days).map((occurrence) => {
    const occurredAt = atLocal(start, occurrence.dayOffset, occurrence.hour, occurrence.minute);
    const timestamp = occurredAt.getTime();
    return {
      story: occurrence.story,
      deviceId: occurrence.deviceId,
      occurredAt,
      webhook: buildMotionWebhook({
        accountId,
        deviceId: occurrence.deviceId,
        timestamp,
        subType: 'motion',
      }),
    };
  });
}
