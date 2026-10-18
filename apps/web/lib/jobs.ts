import { eq, sql } from 'drizzle-orm';

import { jobs, type Db } from '@predator-guard/db';

/**
 * The job queue behind the fast webhook ack (FEATURES.md F2 criterion 3).
 *
 * A single `jobs` table and two operations: `enqueueJob` writes a row,
 * `drainJobs` claims rows atomically and runs the registered handlers. The
 * claim is `FOR UPDATE SKIP LOCKED`, so running two drains at once - and
 * later, two instances of the app - never double-processes a job.
 *
 * Failures retry with exponential backoff up to `MAX_JOB_ATTEMPTS`, then land
 * in `failed` with the error kept in `last_error` for inspection.
 */

export const MAX_JOB_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 30_000;

/** Normalise `execute()` results across the postgres-js and PGlite drivers. */
function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const maybe = result as { rows?: Array<Record<string, unknown>> } | null;
  return maybe?.rows ?? [];
}

export interface ClaimedJob {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
}

/**
 * Job handlers receive the payload as stored and the claimed job's identity.
 * They either resolve (job done) or throw (job retries, then fails).
 */
export type JobHandler = (payload: unknown, job: { id: string; attempts: number }) => Promise<void>;

export async function enqueueJob(db: Db, kind: string, payload: unknown): Promise<string> {
  const rows = await db
    .insert(jobs)
    .values({ kind, payload })
    .returning({ id: jobs.id });
  return rows[0]!.id;
}

/** Atomically claim the oldest due pending job, or `null` when none is due. */
async function claimNextJob(db: Db): Promise<ClaimedJob | null> {
  const result = await db.execute(sql`
    UPDATE "jobs"
    SET "status" = 'running', "locked_at" = now(), "updated_at" = now()
    WHERE "id" = (
      SELECT "id" FROM "jobs"
      WHERE "status" = 'pending' AND "run_at" <= now()
      ORDER BY "run_at"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "kind", "payload", "attempts"
  `);
  const row = resultRows(result)[0];
  if (!row) return null;
  return {
    id: String(row.id),
    kind: String(row.kind),
    payload: row.payload ?? null,
    attempts: Number(row.attempts ?? 0),
  };
}

export interface DrainJobsOptions {
  handlers: Record<string, JobHandler>;
  /** Stop after this many jobs (default 25) - a drain is a bounded sweep, not a daemon. */
  max?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * Process due jobs until the queue is empty or `max` is reached.
 * Returns how many jobs were attempted.
 */
export async function drainJobs(db: Db, options: DrainJobsOptions): Promise<number> {
  const max = options.max ?? 25;
  const now = options.now ?? Date.now;
  let processed = 0;

  while (processed < max) {
    const job = await claimNextJob(db);
    if (!job) break;
    processed += 1;

    const handler = options.handlers[job.kind];
    try {
      if (!handler) {
        throw new Error(`No handler registered for job kind "${job.kind}"`);
      }
      await handler(job.payload, { id: job.id, attempts: job.attempts });
      await db
        .update(jobs)
        .set({ status: 'done', lastError: null, updatedAt: new Date(now()) })
        .where(eq(jobs.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      const message = error instanceof Error ? error.message : String(error);
      const willRetry = attempts < MAX_JOB_ATTEMPTS;
      await db
        .update(jobs)
        .set({
          status: willRetry ? 'pending' : 'failed',
          attempts,
          lastError: message.slice(0, 2000),
          runAt: new Date(now() + Math.min(1000 * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS)),
          lockedAt: null,
          updatedAt: new Date(now()),
        })
        .where(eq(jobs.id, job.id));
    }
  }

  return processed;
}
