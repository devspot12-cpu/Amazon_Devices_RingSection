import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { createDb, type Db } from './client.js';
import { applyMigrations } from './migrations.js';
import { events, farms, jobs } from './schema.js';

/**
 * These tests run on PGlite - a real Postgres in WASM - so they exercise the
 * exact DDL and SQL the app uses in production, with no server and no Docker.
 */

const EXPECTED_TABLES = [
  'alerts',
  'detections',
  'devices',
  'events',
  'farms',
  'ignore_list',
  'jobs',
  'ring_tokens',
  'rules',
  'schema_migrations',
  'zones',
] as const;

function rows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = result as { rows?: Array<Record<string, unknown>> } | null;
  return maybe?.rows ?? [];
}

async function withMemoryDb(run: (db: Db) => Promise<void>): Promise<void> {
  const { db, close } = await createDb({ pgliteDataDir: 'memory://' });
  try {
    await run(db);
  } finally {
    await close();
  }
}

describe('migrations', () => {
  it('creates every table in the data model', async () => {
    await withMemoryDb(async (db) => {
      const result = await db.execute(
        sql`SELECT "table_name" FROM information_schema.tables WHERE "table_schema" = 'public' ORDER BY "table_name"`,
      );
      const names = rows(result).map((row) => String(row.table_name));
      for (const table of EXPECTED_TABLES) {
        expect(names).toContain(table);
      }
    });
  });

  it('is idempotent - a second run applies nothing and throws nothing', async () => {
    await withMemoryDb(async (db) => {
      await expect(applyMigrations(db)).resolves.toEqual([]);
    });
  });
});

describe('schema round-trips', () => {
  it('stores a farm and a Ring event with its raw payload', async () => {
    await withMemoryDb(async (db) => {
      const [farm] = await db
        .insert(farms)
        .values({ name: 'Hillcrest Farm', ownerEmail: 'farmer@example.com' })
        .returning();
      expect(farm?.id).toBeTruthy();

      const rawJson = {
        meta: { version: '1.1', request_id: 'req-1', account_id: 'acct-1' },
        data: { id: 'evt-1', type: 'motion_detected' },
      };
      const [event] = await db
        .insert(events)
        .values({
          farmId: farm!.id,
          ringDeviceId: 'cam-coop',
          ringEventId: 'evt-1',
          ringRequestId: 'req-1',
          eventType: 'motion_detected',
          eventClass: 'motion',
          occurredAt: new Date('2026-10-18T02:30:00.000Z'),
          rawJson,
        })
        .returning();

      expect(event?.eventClass).toBe('motion');
      expect(event?.rawJson).toEqual(rawJson);
      expect(event?.occurredAt.toISOString()).toBe('2026-10-18T02:30:00.000Z');
    });
  });

  it('rejects a duplicate Ring event id - the unique index IS the dedupe', async () => {
    await withMemoryDb(async (db) => {
      const base = {
        ringDeviceId: 'cam-coop',
        ringEventId: 'evt-dup',
        eventType: 'motion_detected',
        eventClass: 'motion',
        occurredAt: new Date(),
        rawJson: {},
      };
      await db.insert(events).values({ ...base, ringRequestId: 'req-a' });
      await expect(
        db.insert(events).values({ ...base, ringRequestId: 'req-b' }),
      ).rejects.toThrow();
    });
  });

  it('queues jobs with a pending status by default', async () => {
    await withMemoryDb(async (db) => {
      const [job] = await db
        .insert(jobs)
        .values({ kind: 'process_event', payload: { eventId: 'evt-1' } })
        .returning();
      expect(job?.status).toBe('pending');
      expect(job?.attempts).toBe(0);
    });
  });
});
