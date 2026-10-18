import { createDb, type Db } from '@predator-guard/db';

import { loadConfig } from './config';

/**
 * The app's database handle.
 *
 * `getDb()` is a lazy singleton pinned to `globalThis`: Next.js dev hot-reload
 * re-evaluates modules on every edit, and without the pin each reload would
 * open another PGlite instance (each one a multi-second WASM boot) or another
 * Postgres pool. One handle per process, created on first use and kept.
 *
 * Routes and server components call `getDb()`; tests inject their own handle
 * via `setDbForTests()` so they never touch the real dev database file.
 */

interface GlobalWithDb {
  __predatorGuardDb?: Promise<Db>;
}

let testDb: Db | null = null;

/** Point `getDb()` at a test-controlled database (`null` restores normal behaviour). */
export function setDbForTests(db: Db | null): void {
  testDb = db;
}

export async function getDb(): Promise<Db> {
  if (testDb) return testDb;

  const globalRef = globalThis as unknown as GlobalWithDb;
  if (!globalRef.__predatorGuardDb) {
    const config = loadConfig();
    globalRef.__predatorGuardDb = createDb({
      url: config.databaseUrl,
      pgliteDataDir: config.pgliteDataDir,
    }).then((handle) => handle.db);
  }
  return globalRef.__predatorGuardDb;
}
