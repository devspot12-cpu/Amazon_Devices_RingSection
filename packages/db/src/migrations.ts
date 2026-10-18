import { sql } from 'drizzle-orm';

import type { Db } from './client.js';

/**
 * Migrations, embedded as SQL strings.
 *
 * Deliberately not drizzle-kit output read from disk: the runner must work
 * identically in PGlite (tests, zero-config dev), in a Postgres container and
 * inside the Next.js bundle, where relative file reads are fragile. The SQL is
 * hand-written to match `schema.ts` one-to-one; drizzle-kit can take over
 * generation later without changing how migrations are applied.
 *
 * Every statement is idempotent (`IF NOT EXISTS`), and applied ids are tracked
 * in `schema_migrations` so the runner is safe to call on every boot.
 */

export interface Migration {
  id: string;
  statements: readonly string[];
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0000_init',
    statements: [
      `CREATE TABLE IF NOT EXISTS "farms" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "owner_email" text NOT NULL,
        "ring_account_id" text,
        "alert_phone" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "farms_ring_account_id_idx" ON "farms" ("ring_account_id")`,

      `CREATE TABLE IF NOT EXISTS "ring_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid REFERENCES "farms" ("id") ON DELETE CASCADE,
        "ring_account_id" text,
        "status" text NOT NULL DEFAULT 'unclaimed',
        "access_enc" text NOT NULL,
        "refresh_enc" text NOT NULL,
        "scopes" text,
        "access_expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "ring_tokens_farm_id_idx" ON "ring_tokens" ("farm_id")`,
      `CREATE INDEX IF NOT EXISTS "ring_tokens_status_idx" ON "ring_tokens" ("status")`,
      `CREATE INDEX IF NOT EXISTS "ring_tokens_ring_account_id_idx" ON "ring_tokens" ("ring_account_id")`,

      `CREATE TABLE IF NOT EXISTS "zones" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid NOT NULL REFERENCES "farms" ("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "kind" text NOT NULL,
        "livestock" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "zones_farm_kind_idx" ON "zones" ("farm_id", "kind")`,

      `CREATE TABLE IF NOT EXISTS "devices" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid NOT NULL REFERENCES "farms" ("id") ON DELETE CASCADE,
        "ring_device_id" text NOT NULL,
        "name" text NOT NULL DEFAULT '',
        "device_type" text,
        "online" boolean NOT NULL DEFAULT false,
        "e2ee" boolean NOT NULL DEFAULT false,
        "capabilities" jsonb,
        "configurations" jsonb,
        "zone_id" uuid REFERENCES "zones" ("id") ON DELETE SET NULL,
        "last_seen_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "devices_farm_ring_device_idx" ON "devices" ("farm_id", "ring_device_id")`,
      `CREATE INDEX IF NOT EXISTS "devices_zone_id_idx" ON "devices" ("zone_id")`,

      `CREATE TABLE IF NOT EXISTS "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid REFERENCES "farms" ("id") ON DELETE SET NULL,
        "device_id" uuid REFERENCES "devices" ("id") ON DELETE SET NULL,
        "ring_device_id" text NOT NULL,
        "ring_event_id" text NOT NULL,
        "ring_request_id" text NOT NULL,
        "event_type" text NOT NULL,
        "event_class" text NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "received_at" timestamptz NOT NULL DEFAULT now(),
        "raw_json" jsonb NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "events_ring_event_id_idx" ON "events" ("ring_event_id")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "events_ring_request_id_idx" ON "events" ("ring_request_id")`,
      `CREATE INDEX IF NOT EXISTS "events_farm_occurred_idx" ON "events" ("farm_id", "occurred_at")`,

      `CREATE TABLE IF NOT EXISTS "detections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "event_id" uuid NOT NULL REFERENCES "events" ("id") ON DELETE CASCADE,
        "species" text NOT NULL DEFAULT 'unknown',
        "confidence" real NOT NULL DEFAULT 0,
        "model" text,
        "frame_url" text,
        "status" text NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "detections_event_id_idx" ON "detections" ("event_id")`,

      `CREATE TABLE IF NOT EXISTS "rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid NOT NULL REFERENCES "farms" ("id") ON DELETE CASCADE,
        "species" text NOT NULL,
        "zone_kind" text NOT NULL,
        "time_window" text,
        "severity" text NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "rules_farm_species_zone_idx" ON "rules" ("farm_id", "species", "zone_kind")`,

      `CREATE TABLE IF NOT EXISTS "alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "detection_id" uuid NOT NULL REFERENCES "detections" ("id") ON DELETE CASCADE,
        "severity" text NOT NULL,
        "channel" text NOT NULL,
        "visit_count" integer NOT NULL DEFAULT 1,
        "sent_at" timestamptz,
        "acked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "alerts_detection_id_idx" ON "alerts" ("detection_id")`,

      `CREATE TABLE IF NOT EXISTS "ignore_list" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "farm_id" uuid NOT NULL REFERENCES "farms" ("id") ON DELETE CASCADE,
        "species" text NOT NULL,
        "zone_kind" text,
        "start_hour" integer,
        "end_hour" integer,
        "label" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "ignore_list_farm_id_idx" ON "ignore_list" ("farm_id")`,

      `CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "kind" text NOT NULL,
        "payload" jsonb,
        "status" text NOT NULL DEFAULT 'pending',
        "attempts" integer NOT NULL DEFAULT 0,
        "run_at" timestamptz NOT NULL DEFAULT now(),
        "locked_at" timestamptz,
        "last_error" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS "jobs_status_run_at_idx" ON "jobs" ("status", "run_at")`,
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
