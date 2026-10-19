import type { Severity } from '@predator-guard/ring';

/**
 * US farm/homestead predator profiles.
 *
 * The same animal is not equally dangerous everywhere: a gray wolf in the
 * Mountain West is a CRITICAL threat to livestock, while the same report in
 * the Southeast is implausible and should not scream. Each region therefore
 * carries the local threat level for the predators that actually live there,
 * and `applyRegion()` nudges the base severity rules accordingly.
 *
 * Everything here is pure data - no I/O - so both the web app and any future
 * tests can rely on it.
 */

export const REGION_IDS = [
  'northeast',
  'southeast',
  'midwest',
  'great-plains',
  'mountain-west',
  'pacific-northwest',
  'southwest',
  'suburban',
] as const;

export type RegionId = (typeof REGION_IDS)[number];

/** How much of a local problem a predator is in one region. */
export type LocalThreat = 'severe' | 'moderate' | 'rare';

export interface RegionInfo {
  id: RegionId;
  label: string;
  /** Example states, so the picker maps to a real place. */
  states: string;
  blurb: string;
  /** Canonical species key -> local threat. Keys must be canonical. */
  predators: Readonly<Record<string, LocalThreat>>;
}

export const REGIONS: readonly RegionInfo[] = [
  {
    id: 'northeast',
    label: 'Northeast',
    states: 'NY · PA · New England',
    blurb: 'Mixed woodland and small family farms — coyotes, raccoons and black bears raid coops.',
    predators: {
      coyote: 'severe',
      raccoon: 'severe',
      fox: 'moderate',
      skunk: 'moderate',
      opossum: 'moderate',
      bear: 'moderate',
      fisher: 'moderate',
      hawk: 'moderate',
      owl: 'moderate',
      deer: 'rare',
    },
  },
  {
    id: 'southeast',
    label: 'Southeast',
    states: 'GA · TN · Carolinas · VA',
    blurb: 'Humid poultry country — coyotes, raccoons and feral hogs do the most damage.',
    predators: {
      coyote: 'severe',
      raccoon: 'severe',
      'wild hog': 'severe',
      opossum: 'moderate',
      bobcat: 'moderate',
      fox: 'moderate',
      bear: 'moderate',
      alligator: 'moderate',
      skunk: 'moderate',
      hawk: 'moderate',
      deer: 'rare',
    },
  },
  {
    id: 'midwest',
    label: 'Midwest',
    states: 'IA · IL · OH · IN · MN · WI',
    blurb: 'Row-crop and livestock country — coyotes, raccoons and red foxes are the nightly regulars.',
    predators: {
      coyote: 'severe',
      raccoon: 'severe',
      fox: 'severe',
      skunk: 'moderate',
      opossum: 'moderate',
      hawk: 'moderate',
      badger: 'moderate',
      deer: 'rare',
      bear: 'rare',
    },
  },
  {
    id: 'great-plains',
    label: 'Great Plains & Texas',
    states: 'TX · OK · KS · NE',
    blurb: 'Open rangeland — coyotes and feral hogs are relentless, with big cats on the western edge.',
    predators: {
      coyote: 'severe',
      'wild hog': 'severe',
      raccoon: 'severe',
      bobcat: 'moderate',
      rattlesnake: 'moderate',
      skunk: 'moderate',
      'mountain lion': 'rare',
      deer: 'rare',
    },
  },
  {
    id: 'mountain-west',
    label: 'Mountain West',
    states: 'MT · WY · CO · ID · UT',
    blurb: 'Backcountry ranches — wolves, bears and mountain lions make every livestock sighting critical.',
    predators: {
      wolf: 'severe',
      bear: 'severe',
      'mountain lion': 'severe',
      coyote: 'severe',
      fox: 'moderate',
      raccoon: 'moderate',
      eagle: 'moderate',
      'wild hog': 'rare',
    },
  },
  {
    id: 'pacific-northwest',
    label: 'Pacific Northwest',
    states: 'WA · OR',
    blurb: 'Wet forest and pasture — black bears and cougars are the headline threats.',
    predators: {
      bear: 'severe',
      'mountain lion': 'severe',
      coyote: 'severe',
      raccoon: 'severe',
      bobcat: 'moderate',
      eagle: 'moderate',
      opossum: 'moderate',
      skunk: 'moderate',
    },
  },
  {
    id: 'southwest',
    label: 'Southwest & Desert',
    states: 'AZ · NM · NV',
    blurb: 'Arid ranch land — coyotes, big cats, bobcats, javelina and rattlesnakes.',
    predators: {
      coyote: 'severe',
      'mountain lion': 'severe',
      bobcat: 'severe',
      rattlesnake: 'severe',
      javelina: 'moderate',
      raccoon: 'moderate',
      'wild hog': 'moderate',
      bear: 'moderate',
    },
  },
  {
    id: 'suburban',
    label: 'Suburban / Backyard',
    states: 'US homes & hobby farms',
    blurb: 'Neighborhood flocks — coyotes and raccoons are the classic backyard coop raiders.',
    predators: {
      coyote: 'severe',
      raccoon: 'severe',
      skunk: 'moderate',
      fox: 'moderate',
      opossum: 'moderate',
      hawk: 'moderate',
      owl: 'moderate',
      bobcat: 'rare',
      bear: 'rare',
    },
  },
];

export const DEFAULT_REGION: RegionId = 'midwest';

export function regionById(id: string | null | undefined): RegionInfo | undefined {
  if (!id) return undefined;
  return REGIONS.find((region) => region.id === id);
}

export function regionLabel(id: string | null | undefined): string {
  return regionById(id)?.label ?? 'Unknown region';
}

/** Predators that live in the wild and can threaten a farm. */
const WILD_PREDATORS: ReadonlySet<string> = new Set([
  'coyote',
  'fox',
  'raccoon',
  'opossum',
  'skunk',
  'bobcat',
  'mountain lion',
  'bear',
  'wolf',
  'wild hog',
  'alligator',
  'rattlesnake',
  'javelina',
  'eagle',
  'owl',
  'hawk',
  'fisher',
  'badger',
  'python',
]);

/** Fold the free-form names the vision model returns onto canonical keys. */
const SPECIES_ALIASES: Readonly<Record<string, string>> = {
  'red fox': 'fox',
  'gray fox': 'fox',
  'grey fox': 'fox',
  'kit fox': 'fox',
  coon: 'raccoon',
  possum: 'opossum',
  'bob cat': 'bobcat',
  lynx: 'bobcat',
  cougar: 'mountain lion',
  puma: 'mountain lion',
  panther: 'mountain lion',
  mountainlion: 'mountain lion',
  'grizzly bear': 'bear',
  'black bear': 'bear',
  'brown bear': 'bear',
  grizzly: 'bear',
  'gray wolf': 'wolf',
  'grey wolf': 'wolf',
  'timber wolf': 'wolf',
  'wild boar': 'wild hog',
  boar: 'wild hog',
  'feral hog': 'wild hog',
  'feral pig': 'wild hog',
  'wild pig': 'wild hog',
  hog: 'wild hog',
  pig: 'wild hog',
  gator: 'alligator',
  crocodile: 'alligator',
  croc: 'alligator',
  'rattle snake': 'rattlesnake',
  snake: 'rattlesnake',
  peccary: 'javelina',
  'bald eagle': 'eagle',
  'golden eagle': 'eagle',
  'great horned owl': 'owl',
  'barn owl': 'owl',
  'red-tailed hawk': 'hawk',
  'feral cat': 'cat',
  'house cat': 'cat',
  whitetail: 'deer',
  'white-tailed deer': 'deer',
  'mule deer': 'deer',
  elk: 'deer',
  'burmese python': 'python',
  'striped skunk': 'skunk',
};

/** Normalise a model-reported animal name to a canonical species key. */
export function canonicalSpecies(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return SPECIES_ALIASES[key] ?? key;
}

const SEVERITY_ORDER: readonly Severity[] = ['log', 'low', 'medium', 'high'];

function clampTo(severity: Severity, ceiling: Severity): Severity {
  return SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(ceiling) ? ceiling : severity;
}

/**
 * Region-tune a base severity.
 *
 * - a predator the area counts as a major problem is escalated one notch
 * - a moderate local problem keeps the base severity
 * - a species the region does not host (or only rarely) is capped at WARNING
 * - non-wild predators (stray dogs, unknown, pets) are left to the base rules
 */
export function applyRegion(
  base: Severity,
  speciesRaw: string,
  regionId?: string | null,
): Severity {
  const region = regionById(regionId);
  if (!region) return base;
  const key = canonicalSpecies(speciesRaw);
  if (!WILD_PREDATORS.has(key)) return base;
  const local = region.predators[key];
  if (local === 'severe') {
    const next = Math.min(SEVERITY_ORDER.length - 1, SEVERITY_ORDER.indexOf(base) + 1);
    return SEVERITY_ORDER[next]!;
  }
  if (local === 'moderate') return base;
  return clampTo(base, 'low');
}

export interface WatchlistEntry {
  species: string;
  threat: LocalThreat;
  label: string;
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

const THREAT_ORDER: Record<LocalThreat, number> = { severe: 0, moderate: 1, rare: 2 };

/** The region's predator watchlist, most threatening first - for the UI. */
export function regionWatchlist(regionId: string | null | undefined): WatchlistEntry[] {
  const region = regionById(regionId);
  if (!region) return [];
  return Object.entries(region.predators)
    .map(([species, threat]) => ({ species, threat, label: titleCase(species) }))
    .sort((a, b) => THREAT_ORDER[a.threat] - THREAT_ORDER[b.threat] || a.species.localeCompare(b.species));
}
