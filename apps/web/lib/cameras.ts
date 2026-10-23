import { and, asc, eq } from 'drizzle-orm';

import { cameras, type Db } from '@predator-guard/db';
import type { ZoneKind } from '@predator-guard/ring';

/**
 * Camera registry: the user registers cameras in the app (name + zone)
 * instead of syncing them from Ring, so the demo needs no device API access.
 * Every detection is attributed to one of these cameras.
 *
 * Cameras belong to the farm region they were registered in, so the dashboard
 * and the camera check only ever see the current region's cameras.
 */

export type Camera = typeof cameras.$inferSelect;

export async function listCameras(db: Db, region: string): Promise<Camera[]> {
  return db
    .select()
    .from(cameras)
    .where(eq(cameras.region, region))
    .orderBy(asc(cameras.name));
}

export async function getCamera(db: Db, id: string): Promise<Camera | null> {
  const rows = await db.select().from(cameras).where(eq(cameras.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Create a camera in one region. The name is unique per region: re-submitting
 * an existing name moves that region's camera to the new zone instead of
 * duplicating it.
 */
export async function createCamera(
  db: Db,
  input: { name: string; zoneKind: ZoneKind; region: string },
): Promise<Camera> {
  const rows = await db
    .insert(cameras)
    .values({ name: input.name, zoneKind: input.zoneKind, region: input.region })
    .onConflictDoUpdate({
      target: [cameras.name, cameras.region],
      set: { zoneKind: input.zoneKind },
    })
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

/**
 * Map one live Ring device onto a registered camera by name. Reused when the
 * live section hooks a motion event, so its detections land in the same
 * per-camera history as manual feeds. Zone stays editable on the dashboard.
 */
export async function findOrCreateCameraByName(
  db: Db,
  input: { name: string; region: string },
): Promise<Camera> {
  const existing = await db
    .select()
    .from(cameras)
    .where(and(eq(cameras.name, input.name), eq(cameras.region, input.region)))
    .limit(1);
  if (existing[0]) return existing[0];
  return createCamera(db, { name: input.name, zoneKind: 'gate', region: input.region });
}
