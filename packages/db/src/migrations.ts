import { sql } from 'drizzle-orm';

import type { Db } from './client.js';

/**
 * Migrations, embedded as SQL strings.
 *
 * Deliberately not drizzle-kit output read from disk: the runner must work
 * identically in PGlite (zero-config dev), in a Postgres container and
 * inside the Next.js bundle, where relative file reads are fragile. Every
 * statement is idempotent (`IF NOT EXISTS`), and applied ids are tracked in
 * `schema_migrations` so the runner is safe to call on every boot.
 */

export interface Migration {
  id: string;
  statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0000_demo_init',
    statements: [
      // Legacy tables from the Ring webhook/OAuth pipeline prototype - dropped
      // (children first, FK order) so every environment, including an old
      // local .pglite, starts from the two-table demo schema.
      `DROP TABLE IF EXISTS "alerts"`,
      `DROP TABLE IF EXISTS "ignore_list"`,
      `DROP TABLE IF EXISTS "rules"`,
      `DROP TABLE IF EXISTS "jobs"`,
      `DROP TABLE IF EXISTS "captures"`,
      `DROP TABLE IF EXISTS "detections"`,
      `DROP TABLE IF EXISTS "events"`,
      `DROP TABLE IF EXISTS "devices"`,
      `DROP TABLE IF EXISTS "zones"`,
      `DROP TABLE IF EXISTS "ring_tokens"`,
      `DROP TABLE IF EXISTS "farms"`,

      `CREATE TABLE IF NOT EXISTS "cameras" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "zone_kind" text NOT NULL DEFAULT 'gate',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "cameras_name_idx" ON "cameras" ("name")`,

      `CREATE TABLE IF NOT EXISTS "detections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "camera_id" uuid NOT NULL REFERENCES "cameras" ("id") ON DELETE CASCADE,
        "species" text NOT NULL DEFAULT 'unknown',
        "animal_score" real NOT NULL DEFAULT 0,
        "danger_type" text NOT NULL DEFAULT 'MONITOR',
        "severity" text NOT NULL DEFAULT 'log',
        "danger_score" integer NOT NULL DEFAULT 0,
        "model" text,
        "people_only" boolean NOT NULL DEFAULT false,
        "status" text NOT NULL DEFAULT 'done',
        "captured_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "detections_camera_captured_idx" ON "detections" ("camera_id", "captured_at")`,
    ],
  },
  {
    id: '0001_farm_profile',
    statements: [
      // Single-row farm profile: the chosen US region tunes the danger rules.
      `CREATE TABLE IF NOT EXISTS "farm_profile" (
        "id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
        "region" text NOT NULL DEFAULT 'midwest',
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`,
    ],
  },
  {
    id: '0002_manual_checks',
    statements: [
      // Manual upload checks are not tied to a camera, so camera_id becomes
      // nullable and every detection records its source and active region.
      `ALTER TABLE "detections" ALTER COLUMN "camera_id" DROP NOT NULL`,
      `ALTER TABLE "detections" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'camera'`,
      `ALTER TABLE "detections" ADD COLUMN IF NOT EXISTS "region" text`,
    ],
  },
  // The former captures migration was removed: it referenced the legacy farms/events
  // tables, which 0000_demo_init intentionally drops. Captures are not part of
  // the current schema; keeping that migration made every fresh Postgres boot fail.
  {
    id: '0003_region_watchlist',
    statements: [
      `CREATE TABLE IF NOT EXISTS "region_watchlist" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "region_id" text NOT NULL,
        "species" text NOT NULL,
        "threat" text NOT NULL,
        "label" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "region_watchlist_region_species_idx" ON "region_watchlist" ("region_id", "species")`,
      `CREATE INDEX IF NOT EXISTS "region_watchlist_region_idx" ON "region_watchlist" ("region_id")`,
    ],
  },
  {
    id: '0004_camera_region',
    statements: [
      // Cameras and detection history are scoped to the farm region they were
      // recorded in, so switching region shows that region's records only.
      `ALTER TABLE "cameras" ADD COLUMN IF NOT EXISTS "region" text NOT NULL DEFAULT 'midwest'`,
      // Existing cameras belong to whatever region the farm is in right now.
      `UPDATE "cameras" SET "region" = farm_region.region
        FROM (SELECT "region" FROM "farm_profile" WHERE "id" = 'default') AS farm_region
        WHERE "cameras"."region" = 'midwest'`,
      // Camera names are unique per region, not globally: every region can have
      // its own "Coop cam".
      `DROP INDEX IF EXISTS "cameras_name_idx"`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "cameras_name_region_idx" ON "cameras" ("name", "region")`,
      // History recorded before region tagging inherits the farm's region, so
      // no record disappears from every filtered view.
      `UPDATE "detections" SET "region" = farm_region.region
        FROM (SELECT "region" FROM "farm_profile" WHERE "id" = 'default') AS farm_region
        WHERE "detections"."region" IS NULL`,
    ],
  },

];

/** Normalise `execute()` results across the postgres-js and PGlite drivers. */
function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = result as { rows?: Array<Record<string, unknown>> } | null;
  return maybe?.rows ?? [];
}

/**
 * Apply every migration that has not run yet. Returns the ids applied in this
 * call (`[]` when the database is already current).
 */
export async function applyMigrations(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<string[]> {
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "id" text PRIMARY KEY,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    )`,
  );
  const applied = new Set(
    resultRows(await db.execute(sql`SELECT "id" FROM "schema_migrations"`)).map((row) =>
      String(row.id),
    ),
  );

  const justApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.execute(sql.raw(statement));
      }
      await tx.execute(sql`INSERT INTO "schema_migrations" ("id") VALUES (${migration.id})`);
    });
    justApplied.push(migration.id);
  }
  return justApplied;
}
