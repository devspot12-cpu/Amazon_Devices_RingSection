import type { Severity, Species, ZoneKind } from '@predator-guard/ring';

/**
 * `@predator-guard/rules` - the severity rules engine (FEATURES.md F6).
 *
 * Pure, table-driven and free of I/O: the same severity decision must be
 * reproducible in unit tests, the simulator ("brain" tests) and the live
 * alert path. Anything that needs a clock, a database or the network is
 * passed in as data by the caller.
 */

const LIVESTOCK_ZONE_KINDS: ReadonlySet<ZoneKind> = new Set(['coop', 'pasture']);

export function isNight(localTime: Date): boolean {
  const hour = localTime.getHours();
  return hour >= 20 || hour < 6;
}

interface DefaultRow {
  livestockNight: Severity;
  livestockDay: Severity;
  nonLivestock: Severity;
}

const DEFAULT_TABLE: Record<Species, DefaultRow> = {
  coyote: { livestockNight: 'high', livestockDay: 'medium', nonLivestock: 'low' },
  fox: { livestockNight: 'high', livestockDay: 'medium', nonLivestock: 'low' },
  dog: { livestockNight: 'high', livestockDay: 'medium', nonLivestock: 'low' },
  raccoon: { livestockNight: 'medium', livestockDay: 'low', nonLivestock: 'log' },
  opossum: { livestockNight: 'medium', livestockDay: 'low', nonLivestock: 'log' },
  deer: { livestockNight: 'log', livestockDay: 'log', nonLivestock: 'log' },
  unknown: { livestockNight: 'medium', livestockDay: 'low', nonLivestock: 'log' },
};

export interface RuleOverride {
  species: Species;
  zoneKind: ZoneKind;
  severity: Severity;
  enabled: boolean;
}

export interface IgnoreEntry {
  species: Species;
  zoneKind?: ZoneKind;
  startHour?: number;
  endHour?: number;
  label?: string;
}

export interface QuietHours {
  startHour: number;
  endHour: number;
}

export interface SeverityInput {
  species: Species;
  zoneKind: ZoneKind;
  localTime: Date;
  overrides?: readonly RuleOverride[];
  ignoreList?: readonly IgnoreEntry[];
  quietHours?: QuietHours;
}

function inHourWindow(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return true;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

function matchesIgnore(entry: IgnoreEntry, input: SeverityInput): boolean {
  if (entry.species !== input.species) return false;
  if (entry.zoneKind !== undefined && entry.zoneKind !== input.zoneKind) return false;
  if (entry.startHour !== undefined && entry.endHour !== undefined) {
    if (!inHourWindow(input.localTime.getHours(), entry.startHour, entry.endHour)) return false;
  }
  return true;
}

export function severity(input: SeverityInput): Severity {
  if ((input.ignoreList ?? []).some((entry) => matchesIgnore(entry, input))) {
    return 'log';
  }
  const override = (input.overrides ?? []).find(
    (rule) => rule.enabled && rule.species === input.species && rule.zoneKind === input.zoneKind,
  );
  let result: Severity;
  if (override) {
    result = override.severity;
  } else {
    const row = DEFAULT_TABLE[input.species];
    if (!LIVESTOCK_ZONE_KINDS.has(input.zoneKind)) {
      result = row.nonLivestock;
    } else {
      result = isNight(input.localTime) ? row.livestockNight : row.livestockDay;
    }
  }
  if (input.quietHours && result !== 'high' && result !== 'log') {
    const { startHour, endHour } = input.quietHours;
    if (inHourWindow(input.localTime.getHours(), startHour, endHour)) return 'log';
  }
  return result;
}

export interface DedupeTracker {
  record(cameraId: string, species: Species, at: Date): { shouldAlert: boolean; visitCount: number };
}

export class InMemoryDedupeTracker implements DedupeTracker {
  private readonly windows = new Map<string, { windowStartMs: number; visitCount: number }>();
  constructor(private readonly windowMs: number = 10 * 60 * 1000) {}
  record(cameraId: string, species: Species, at: Date): { shouldAlert: boolean; visitCount: number } {
    const key = cameraId + ':' + species;
    const atMs = at.getTime();
    const existing = this.windows.get(key);
    if (!existing || atMs - existing.windowStartMs >= this.windowMs) {
      this.windows.set(key, { windowStartMs: atMs, visitCount: 1 });
      return { shouldAlert: true, visitCount: 1 };
    }
    existing.visitCount += 1;
    return { shouldAlert: false, visitCount: existing.visitCount };
  }
}
