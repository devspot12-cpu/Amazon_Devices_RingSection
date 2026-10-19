import { asc, eq } from 'drizzle-orm';

import { cameras, type Db } from '@predator-guard/db';
import type { ZoneKind } from '@predator-guard/ring';

/**
 * Camera registry: the user registers cameras in the app (name + zone)
 * instead of syncing them from Ring, so the demo needs no device API access.
 * Every detection is attributed to one of these cameras.
 */

export type Camera = typeof cameras.$inferSelect;

export async function listCameras(db: Db): Promise<Camera[]> {
  return db.select().from(cameras).orderBy(asc(cameras.name));
}

export async function getCamera(db: Db, id: string): Promise<Camera | null> {
  const rows = await db.select().from(cameras).where(eq(cameras.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Create a camera. The name is unique: re-submitting an existing name moves
 * that camera to the new zone instead of duplicating it.
 */
export async function createCamera(
  db: Db,
  input: { name: string; zoneKind: ZoneKind },
): Promise<Camera> {
  const rows = await db
    .insert(cameras)
    .values({ name: input.name, zoneKind: input.zoneKind })
    .onConflictDoUpdate({ target: cameras.name, set: { zoneKind: input.zoneKind } })
    .returning();
  const created = rows[0];
  if (!created) throw new Error('Camera insert did not return a row');
  return created;
}

/** Delete a camera (its detection history goes with it). False when unknown. */
export async function deleteCamera(db: Db, id: string): Promise<boolean> {
  const rows = await db.delete(cameras).where(eq(cameras.id, id)).returning({ id: cameras.id });
  return rows.length > 0;
}
