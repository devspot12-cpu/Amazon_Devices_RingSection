import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { DETECTION_SOURCES, DETECTION_STATUSES, SEVERITIES, ZONE_KINDS } from '@predator-guard/ring';

/**
 * `@predator-guard/db` - the Postgres data model for the demo.
 *
 * Three tables: the single-row farm profile (US region that tunes the danger
 * rules), the cameras on the farm (auto-seeded with coop/barn/pasture/gate),
 * and the analysis history - one row per frame fed to the AI model, holding
 * timestamp, animal type, animal score and danger type so the dashboard can
 * show the result live and replay the history per camera.
 *
 * Domain vocabularies (zone kinds, severities, statuses) are imported from
 * `@predator-guard/ring` so the schema and the rules engine cannot drift.
 * `species` is free text on purpose: the vision model may answer with any
 * common animal name (bear, wolf, mountain lion...), not just the rule
 * table's list.
 *
 * Column names are snake_case to match the SQL in `migrations.ts`; property
 * names are camelCase for the TypeScript side.
 */

const tz = { withTimezone: true } as const;

/**
 * The single-row farm profile. `region` selects the US predator profile that
 * tunes the danger rules (a wolf is critical in Montana, implausible in
 * Georgia). The row is auto-provisioned on first load, so the app works with
 * zero setup.
 */
export const farmProfile = pgTable('farm_profile', {
  /** Fixed primary key - there is exactly one farm in the demo. */
  id: text('id').primaryKey().default('default'),
  /** Region id from `@predator-guard/rules` (northeast, mountain-west...). */
  region: text('region').notNull().default('midwest'),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

/** One camera on the farm (name + the zone it watches). */
export const cameras = pgTable(
  'cameras',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Drives the severity rules: coop / pasture / shed / gate. */
    zoneKind: text('zone_kind', { enum: ZONE_KINDS }).notNull().default('gate'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('cameras_name_idx').on(table.name)],
);

/** One analysed frame: what was seen, how sure, how dangerous, when and where. */
export const detections = pgTable(
  'detections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for a manual upload check that is not tied to any camera. */
    cameraId: uuid('camera_id').references(() => cameras.id, { onDelete: 'cascade' }),
    /** 'camera' for a named-camera sighting, 'manual' for a one-off upload. */
    source: text('source', { enum: DETECTION_SOURCES }).notNull().default('camera'),
    /** Region active when the frame was judged (danger tuning context). */
    region: text('region'),
    /** Animal type as the model named it (lowercase, free-form). */
    species: text('species').notNull().default('unknown'),
    /** Model confidence, 0..100 - the "Animal Score" shown on screen. */
    animalScore: real('animal_score').notNull().default(0),
    /** CRITICAL | DANGER | WARNING | MONITOR | NONE - the "Danger Type". */
    dangerType: text('danger_type').notNull().default('MONITOR'),
    /** Rules-engine severity behind the label (high/medium/low/log). */
    severity: text('severity', { enum: SEVERITIES }).notNull().default('log'),
    /** 0..100 derived from severity - the sortable danger score. */
    dangerScore: integer('danger_score').notNull().default(0),
    model: text('model'),
    peopleOnly: boolean('people_only').notNull().default(false),
    status: text('status', { enum: DETECTION_STATUSES }).notNull().default('done'),
    /** When the frame was captured. */
    capturedAt: timestamp('captured_at', tz).notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [index('detections_camera_captured_idx').on(table.cameraId, table.capturedAt)],
);

export type Camera = typeof cameras.$inferSelect;
export type Detection = typeof detections.$inferSelect;
export type FarmProfile = typeof farmProfile.$inferSelect;
