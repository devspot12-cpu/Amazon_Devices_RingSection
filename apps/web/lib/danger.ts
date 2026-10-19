import { SPECIES, type Severity, type Species, type ZoneKind } from '@predator-guard/ring';
import {
  applyRegion,
  canonicalSpecies,
  isNight,
  severity as ruleSeverity,
} from '@predator-guard/rules';

/**
 * Danger evaluation: one place that turns "the model said X, on camera in
 * zone Y, at time Z, on a farm in region R" into the Danger Type shown on
 * screen and stored in the history.
 *
 * The severity rules engine (`@predator-guard/rules`) owns species x zone x
 * time-of-day, then `applyRegion()` tunes the result for the farm's US region
 * (a wolf is CRITICAL in the Mountain West, capped at WARNING in the
 * Southeast). This module adds the bridge for the free-form names the vision
 * model may return: apex predators the rule table does not list get a
 * predator's treatment, everything else falls back to the `unknown` row.
 */

/** Canonical predator names worth treating as a threat even if not in the rule table. */
const APEX_PREDATORS: ReadonlySet<string> = new Set([
  'bear',
  'wolf',
  'mountain lion',
  'bobcat',
  'alligator',
  'wild hog',
  'python',
  'javelina',
  'rattlesnake',
]);

const KNOWN_SPECIES: ReadonlySet<string> = new Set(SPECIES);

/** Danger Type label per severity - what the screen shows. */
export const DANGER_LABELS: Record<Severity, string> = {
  high: 'CRITICAL',
  medium: 'DANGER',
  low: 'WARNING',
  log: 'MONITOR',
};

/** Sortable danger score per severity (0..100), stored with each detection. */
export const DANGER_SCORES: Record<Severity, number> = {
  high: 90,
  medium: 60,
  low: 30,
  log: 10,
};

/** No animal worth alerting about (e.g. people-only frames). */
export const NO_DANGER = { severity: 'log' as const, dangerType: 'NONE', dangerScore: 0 };

export interface DangerVerdict {
  severity: Severity;
  dangerType: string;
  dangerScore: number;
}

const LIVESTOCK_ZONES: ReadonlySet<ZoneKind> = new Set(['coop', 'pasture']);

export function evaluateDanger(
  speciesRaw: string,
  zoneKind: ZoneKind,
  at: Date,
  regionId?: string | null,
): DangerVerdict {
  const species = canonicalSpecies(speciesRaw);
  let base: Severity;
  if (KNOWN_SPECIES.has(species)) {
    base = ruleSeverity({ species: species as Species, zoneKind, localTime: at });
  } else if (APEX_PREDATORS.has(species)) {
    // Big predator in a livestock zone after dark is as bad as it gets.
    base = LIVESTOCK_ZONES.has(zoneKind) && isNight(at) ? 'high' : 'medium';
  } else {
    // Unknown-to-the-table animal (cat, rabbit, bird...) - behave like `unknown`.
    base = ruleSeverity({ species: 'unknown', zoneKind, localTime: at });
  }
  const severityLevel = applyRegion(base, species, regionId);
  return {
    severity: severityLevel,
    dangerType: DANGER_LABELS[severityLevel],
    dangerScore: DANGER_SCORES[severityLevel],
  };
}
