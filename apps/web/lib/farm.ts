import { eq } from 'drizzle-orm';

import { cameras, farmProfile, regionWatchlist, type Db } from '@predator-guard/db';
import { DEFAULT_REGION, regionById, regionWatchlist as ruleWatchlist, type RegionId } from '@predator-guard/rules';
import type { ZoneKind } from '@predator-guard/ring';

/**
 * The farm profile: which US region the farm sits in (which tunes the danger
 * rules) and the cameras that come with it.
 *
 * On the very first request the row and the default cameras are created, so
 * the demo is usable without the user adding anything by hand. Changing the
 * region later only re-tunes the rules - it never touches the cameras.
 */

export type Farm = typeof farmProfile.$inferSelect;

/**
 * The cameras a new farm starts with - the four places US farmhouses and
 * homesteads actually watch.
 */
export const DEFAULT_CAMERAS: ReadonlyArray<{ name: string; zoneKind: ZoneKind }> = [
  { name: 'Coop cam', zoneKind: 'coop' },
  { name: 'Barn cam', zoneKind: 'shed' },
  { name: 'Pasture cam', zoneKind: 'pasture' },
  { name: 'Driveway cam', zoneKind: 'gate' },
];

async function seedRegionWatchlist(db: Db, regionId: string): Promise<void> {
  const entries = ruleWatchlist(regionId);
  if (entries.length === 0) return;
  await db
    .insert(regionWatchlist)
    .values(entries.map((entry) => ({ regionId, species: entry.species, threat: entry.threat, label: entry.label })))
    .onConflictDoNothing();
}

export async function listFarmWatchlist(db: Db, regionId: string) {
  return db.select().from(regionWatchlist).where(eq(regionWatchlist.regionId, regionId));
}

export async function getFarm(db: Db): Promise<Farm | null> {
  const rows = await db.select().from(farmProfile).where(eq(farmProfile.id, 'default')).limit(1);
  return rows[0] ?? null;
}

async function seedDefaultCameras(db: Db, region: string): Promise<void> {
  await db
    .insert(cameras)
    .values(DEFAULT_CAMERAS.map((camera) => ({ ...camera, region })))
    .onConflictDoNothing();
}

/**
 * Ensure the farm exists. First call creates the profile and the default
 * cameras; later calls are a single read. Safe under concurrent first
 * requests: the insert is `ON CONFLICT DO NOTHING`, so only one wins and only
 * the winner seeds cameras.
 */
export async function ensureFarm(db: Db): Promise<Farm> {
  const existing = await getFarm(db);
  if (existing) {
    await seedRegionWatchlist(db, existing.region);
    return existing;
  }
  const inserted = await db
    .insert(farmProfile)
    .values({ id: 'default', region: DEFAULT_REGION })
    .onConflictDoNothing()
    .returning();
  if (inserted.length > 0) {
    await seedDefaultCameras(db, DEFAULT_REGION);
    await seedRegionWatchlist(db, DEFAULT_REGION);
  }
  return (await getFarm(db)) ?? inserted[0]!;
}

export async function setFarmRegion(db: Db, region: string): Promise<Farm> {
  const rows = await db
    .insert(farmProfile)
    .values({ id: 'default', region })
    .onConflictDoUpdate({
      target: farmProfile.id,
      set: { region, updatedAt: new Date() },
    })
    .returning();
  const updated = rows[0];
  if (!updated) throw new Error('Farm profile update returned no row');
  await seedRegionWatchlist(db, updated.region);
  // Each region is its own workspace: give a freshly selected region the
  // standard camera set so its dashboard has somewhere to record detections.
  // `onConflictDoNothing` keeps any cameras already registered there.
  await seedDefaultCameras(db, updated.region);
  return updated;
}
