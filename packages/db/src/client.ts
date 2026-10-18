import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { applyMigrations } from './migrations.js';
import * as schema from './schema.js';

/**
 * The database surface used across the app.
 *
 * Both drivers (postgres-js in production, PGlite in tests and zero-config
 * dev) return structurally identical drizzle databases, so callers depend on
 * this structural type - not on which driver opened the connection.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface CreateDbOptions {
  /**
   * Postgres connection string. When omitted (or empty) the embedded PGlite
   * database is opened instead - same SQL dialect, no server to run.
   */
  url?: string;
  /** PGlite data directory. `memory://` (default) is ephemeral; a path persists. */
  pgliteDataDir?: string;
  /** Apply pending migrations on open (default true). */
  migrate?: boolean;
}

export interface DbHandle {
  db: Db;
  driver: 'postgres' | 'pglite';
  close(): Promise<void>;
}

/**
 * Open the database.
 *
 * Postgres when DATABASE_URL is set, embedded PGlite otherwise. PGlite is a
 * real Postgres compiled to WASM - the same DDL, the same queries - so tests
 * and the zero-config demo exercise the production SQL. Only the transport
 * changes.
 */
export async function createDb(options: CreateDbOptions = {}): Promise<DbHandle> {
  const { url, pgliteDataDir = 'memory://', migrate = true } = options;

  if (url) {
    // `onnotice` muted: Postgres NOTICE chatter (IF NOT EXISTS, etc.) is not ours to relay.
    const client = postgres(url, { max: 10, onnotice: () => {} });
    const db: Db = drizzlePostgres(client, { schema });
    if (migrate) await applyMigrations(db);
    return {
      db,
      driver: 'postgres',
      close: async () => {
        await client.end();
      },
    };
  }

  const client = new PGlite(pgliteDataDir);
  await client.waitReady;
  const db: Db = drizzlePglite(client, { schema });
  if (migrate) await applyMigrations(db);
  return {
    db,
    driver: 'pglite',
    close: async () => {
      await client.close();
    },
  };
}
