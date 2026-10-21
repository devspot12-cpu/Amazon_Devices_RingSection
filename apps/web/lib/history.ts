import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';

import { cameras, detections, type Db } from '@predator-guard/db';
import type { DetectionSource, DetectionStatus, Severity } from '@predator-guard/ring';

/**
 * The analysis history: every frame fed to the AI model is saved here
 * (timestamp, animal type, animal score, danger type) in parallel with the
 * on-screen result, and the dashboard reads it back per camera. Manual upload
 * checks are saved too, with no camera attached.
 */

/**
 * Normalise a timestamp coming back from the driver to an ISO string.
 *
 * Columns declared with Drizzle's timestamp type arrive as `Date`, but raw
 * SQL aggregates (`max(captured_at)`) are not run through the column mapper,
 * and PGlite/postgres-js hand those back as strings - so accept both.
 */
function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface SaveDetectionInput {
  /** Null for a manual upload check. */
  cameraId: string | null;
  species: string;
  animalScore: number;
  dangerType: string;
  severity: Severity;
  dangerScore: number;
  model: string | null;
  peopleOnly: boolean;
  status: DetectionStatus;
  capturedAt: Date;
  /** 'camera' (default) or 'manual'. */
  source?: DetectionSource;
  /** Farm region active when the frame was judged. */
  region?: string | null;
  /** Small JPEG data URL of the analysed frame. */
  thumbnail?: string | null;
}

export async function saveDetection(
  db: Db,
  input: SaveDetectionInput,
): Promise<typeof detections.$inferSelect> {
  const rows = await db
    .insert(detections)
    .values({
      cameraId: input.cameraId,
      source: input.source ?? 'camera',
      region: input.region ?? null,
      species: input.species,
      animalScore: input.animalScore,
      dangerType: input.dangerType,
      severity: input.severity,
      dangerScore: input.dangerScore,
      model: input.model,
      peopleOnly: input.peopleOnly,
      status: input.status,
      thumbnail: input.thumbnail ?? null,
      capturedAt: input.capturedAt,
    })
    .returning();
  const inserted = rows[0];
  if (!inserted) throw new Error('Detection insert did not return a row');
  return inserted;
}

/** One row of the history feed, with the camera it belongs to (if any). */
export interface DetectionRow {
  id: string;
  cameraId: string | null;
  cameraName: string | null;
  zoneKind: string | null;
  source: string;
  region: string | null;
  species: string;
  animalScore: number;
  dangerType: string;
  dangerScore: number;
  severity: string;
  model: string | null;
  peopleOnly: boolean;
  status: string;
  capturedAt: string;
  /** Small JPEG data URL of the analysed frame. */
  thumbnail: string | null;
}

/** Newest detections first - the dashboard's threat log, one region only. */
export async function listRecentDetections(
  db: Db,
  region: string,
  limit = 20,
): Promise<DetectionRow[]> {
  const rows = await db
    .select({
      id: detections.id,
      cameraId: detections.cameraId,
      cameraName: cameras.name,
      zoneKind: cameras.zoneKind,
      source: detections.source,
      region: detections.region,
      species: detections.species,
      animalScore: detections.animalScore,
      dangerType: detections.dangerType,
      dangerScore: detections.dangerScore,
      severity: detections.severity,
      model: detections.model,
      peopleOnly: detections.peopleOnly,
      status: detections.status,
      capturedAt: detections.capturedAt,
      thumbnail: detections.thumbnail,
    })
    .from(detections)
    .leftJoin(cameras, eq(detections.cameraId, cameras.id))
    .where(eq(detections.region, region))
    .orderBy(desc(detections.capturedAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, capturedAt: toIsoString(row.capturedAt) }));
}

/** The most recent capture of one camera - what the hover preview shows. */
export interface CameraCaptureRow {
  cameraId: string;
  species: string;
  animalScore: number;
  dangerType: string;
  capturedAt: string;
  thumbnail: string | null;
}

/**
 * The newest detection per camera in one region.
 *
 * The correlated `max(captured_at)` keeps this to one row per camera
 * without pulling the whole history into memory, and it works the same on
 * PGlite and Postgres.
 */
export async function listLatestDetectionByCamera(
  db: Db,
  region: string,
): Promise<CameraCaptureRow[]> {
  const rows = await db
    .select({
      cameraId: detections.cameraId,
      species: detections.species,
      animalScore: detections.animalScore,
      dangerType: detections.dangerType,
      capturedAt: detections.capturedAt,
      thumbnail: detections.thumbnail,
    })
    .from(detections)
    .where(
      and(
        eq(detections.region, region),
        isNotNull(detections.cameraId),
        sql`${detections.capturedAt} = (SELECT max(d2."captured_at") FROM "detections" d2 WHERE d2."camera_id" = ${detections.cameraId})`,
      ),
    )
    .orderBy(desc(detections.capturedAt));

  // Two frames captured in the same instant would both match; keep the first.
  const seen = new Set<string>();
  const latest: CameraCaptureRow[] = [];
  for (const row of rows) {
    if (!row.cameraId || seen.has(row.cameraId)) continue;
    seen.add(row.cameraId);
    latest.push({ ...row, cameraId: row.cameraId, capturedAt: toIsoString(row.capturedAt) });
  }
  return latest;
}

/** One aggregated line: how often one animal type was seen on one camera. */
export interface CameraSpeciesRow {
  cameraId: string;
  cameraName: string;
  zoneKind: string;
  species: string;
  count: number;
  worstDangerScore: number;
  lastSeen: string;
}

/** Animal types per camera for one region, most recently seen first (manual checks excluded). */
export async function speciesSummaryByCamera(db: Db, region: string): Promise<CameraSpeciesRow[]> {
  // Raw SQL aggregates are not run through Drizzle's column mapper, so the
  // driver decides the JS type: PGlite/postgres-js hand `max(captured_at)`
  // back as a string, hence the loose type and toIsoString() below.
  const rows: Array<{
    cameraId: string;
    cameraName: string;
    zoneKind: string;
    species: string;
    count: number;
    worstDangerScore: number;
    lastSeen: Date | string;
  }> = await db
    .select({
      cameraId: cameras.id,
      cameraName: cameras.name,
      zoneKind: cameras.zoneKind,
      species: detections.species,
      count: sql<number>`count(*)::int`,
      worstDangerScore: sql<number>`max(${detections.dangerScore})::int`,
      lastSeen: sql<Date | string>`max(${detections.capturedAt})`,
    })
    .from(detections)
    .innerJoin(cameras, eq(detections.cameraId, cameras.id))
    .where(eq(detections.region, region))
    .groupBy(cameras.id, cameras.name, cameras.zoneKind, detections.species)
    .orderBy(desc(sql`max(${detections.capturedAt})`));
  return rows.map((row) => ({
    cameraId: row.cameraId,
    cameraName: row.cameraName,
    zoneKind: row.zoneKind,
    species: row.species,
    count: Number(row.count),
    worstDangerScore: Number(row.worstDangerScore),
    lastSeen: toIsoString(row.lastSeen),
  }));
}
