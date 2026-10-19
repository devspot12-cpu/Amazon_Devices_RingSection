import type { ZoneKind } from '@predator-guard/ring';

/** Human labels for the four zone kinds (shared by dashboard and /video). */
export const ZONE_LABELS: Record<ZoneKind, string> = {
  coop: 'Coop',
  pasture: 'Pasture',
  shed: 'Feed shed',
  gate: 'Gate',
};

export interface ZoneOption {
  kind: ZoneKind;
  label: string;
}

export const ZONE_OPTIONS: readonly ZoneOption[] = (
  ['coop', 'pasture', 'shed', 'gate'] as const
).map((kind) => ({ kind, label: ZONE_LABELS[kind] }));

/** Label for a zone kind that may come from the database as plain text. */
export function zoneLabel(kind: string): string {
  return ZONE_LABELS[kind as ZoneKind] ?? kind;
}
