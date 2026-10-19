import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  ALERT_CHANNELS,
  DETECTION_STATUSES,
  SEVERITIES,
  SPECIES,
  ZONE_KINDS,
} from '@predator-guard/ring';

/**
 * `@predator-guard/db` - the Postgres data model (PLAN.md S6).
 *
 * The plan's core tables plus the optional `ignore_list`, `jobs` queue, and
 * `captures` table for database-backed event images and camera metadata.
 *
 * Domain vocabularies (species, zone kinds, severities...) are imported from
 * `@predator-guard/ring` rather than re-declared, so a schema change and a
 * rules-engine change can never drift apart.
 *
 * Column names are snake_case to match the SQL in `migrations.ts`; property
 * names are camelCase for the TypeScript side. `events.event_class` is the
 * plan's `class` column: Ring's `sub_type` for the event.
 */

const tz = { withTimezone: true } as const;

/** One farm per linked Ring account. */
export const farms = pgTable(
  'farms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    ownerEmail: text('owner_email').notNull(),
    /** From `GET /v1/users/me` - set at claim time, never from the browser. */
    ringAccountId: text('ring_account_id'),
    alertPhone: text('alert_phone'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('farms_ring_account_id_idx').on(table.ringAccountId)],
);

/**
 * Encrypted OAuth tokens.
 *
 * A token row starts life `unclaimed` (the token exchange ran, but no farm has
 * proven ownership of the nonce yet). The account link flow promotes it to
 * `claimed` and binds it to a farm. Unlink deletes the row.
 */
export const ringTokens = pgTable(
  'ring_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id').references(() => farms.id, { onDelete: 'cascade' }),
    ringAccountId: text('ring_account_id'),
    status: text('status', { enum: ['unclaimed', 'claimed'] }).notNull().default('unclaimed'),
    /** AES-256-GCM sealed (see packages/ring token vault). Never logged. */
    accessEnc: text('access_enc').notNull(),
    refreshEnc: text('refresh_enc').notNull(),
    scopes: text('scopes'),
    accessExpiresAt: timestamp('access_expires_at', tz),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (table) => [
    index('ring_tokens_farm_id_idx').on(table.farmId),
    index('ring_tokens_status_idx').on(table.status),
    index('ring_tokens_ring_account_id_idx').on(table.ringAccountId),
  ],
);

/** A labelled area of the farm (coop, pasture, shed, gate). Drives severity. */
export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ZONE_KINDS }).notNull(),
    /** Free-form, e.g. "chickens". */
    livestock: text('livestock'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('zones_farm_kind_idx').on(table.farmId, table.kind)],
);

/** A Ring camera, refreshed by device discovery. */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    ringDeviceId: text('ring_device_id').notNull(),
    name: text('name').notNull().default(''),
    deviceType: text('device_type'),
    online: boolean('online').notNull().default(false),
    /**
     * TAKE/E2EE devices return unreadable media. Flagged here so the media
     * stage never schedules a doomed fetch (F3 criterion 2).
     */
    e2ee: boolean('e2ee').notNull().default(false),
    capabilities: jsonb('capabilities').$type<unknown>(),
    /** Raw configurations: motion zones, privacy zones, image settings. */
    configurations: jsonb('configurations').$type<unknown>(),
    zoneId: uuid('zone_id').references(() => zones.id, { onDelete: 'set null' }),
    lastSeenAt: timestamp('last_seen_at', tz),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('devices_farm_ring_device_idx').on(table.farmId, table.ringDeviceId),
    index('devices_zone_id_idx').on(table.zoneId),
  ],
);

/**
 * One row per accepted Ring webhook. `ring_event_id` and `ring_request_id` are
 * both unique: that uniqueness *is* the webhook dedupe (F2 criterion 2).
 * The raw payload is kept so every event can be replayed in tests.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id').references(() => farms.id, { onDelete: 'set null' }),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    ringDeviceId: text('ring_device_id').notNull(),
    ringEventId: text('ring_event_id').notNull(),
    ringRequestId: text('ring_request_id').notNull(),
    eventType: text('event_type').notNull(),
    /** Ring's `sub_type`; `unknown` when Ring omits it. */
    eventClass: text('event_class').notNull(),
    occurredAt: timestamp('occurred_at', tz).notNull(),
    receivedAt: timestamp('received_at', tz).notNull().defaultNow(),
    rawJson: jsonb('raw_json').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('events_ring_event_id_idx').on(table.ringEventId),
    uniqueIndex('events_ring_request_id_idx').on(table.ringRequestId),
    index('events_farm_occurred_idx').on(table.farmId, table.occurredAt),
  ],
);

/** Captured Ring frame and its event/camera metadata, stored together in Postgres. */
export const captures = pgTable(
  'captures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'set null' }),
    ringEventId: text('ring_event_id'),
    ringDeviceId: text('ring_device_id').notNull(),
    deviceName: text('device_name').notNull(),
    zoneKind: text('zone_kind'),
    source: text('source').notNull(),
    capturedAt: timestamp('captured_at', tz).notNull(),
    savedAt: timestamp('saved_at', tz).notNull().defaultNow(),
    contentType: text('content_type').notNull(),
    imageBytes: customType<{ data: Uint8Array; driverData: Uint8Array }>({
      dataType: () => 'bytea',
    })('image_bytes').notNull(),
  },
  (table) => [
    uniqueIndex('captures_ring_event_id_idx').on(table.ringEventId),
    index('captures_farm_captured_at_idx').on(table.farmId, table.capturedAt),
  ],
);

/** The vision verdict for one event. One detection per event. */
export const detections = pgTable(
  'detections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    species: text('species', { enum: SPECIES }).notNull().default('unknown'),
    confidence: real('confidence').notNull().default(0),
    model: text('model'),
    frameUrl: text('frame_url'),
    status: text('status', { enum: DETECTION_STATUSES }).notNull().default('pending'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('detections_event_id_idx').on(table.eventId)],
);

/** Farmer-editable severity override. A row beats the F6 default table. */
export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    species: text('species', { enum: SPECIES }).notNull(),
    zoneKind: text('zone_kind', { enum: ZONE_KINDS }).notNull(),
    timeWindow: text('time_window'),
    severity: text('severity', { enum: SEVERITIES }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('rules_farm_species_zone_idx').on(table.farmId, table.species, table.zoneKind),
  ],
);

/** Escalation state for one alert. Acknowledgements stop the ladder. */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    detectionId: uuid('detection_id')
      .notNull()
      .references(() => detections.id, { onDelete: 'cascade' }),
    severity: text('severity', { enum: SEVERITIES }).notNull(),
    channel: text('channel', { enum: ALERT_CHANNELS }).notNull(),
    visitCount: integer('visit_count').notNull().default(1),
    sentAt: timestamp('sent_at', tz),
    ackedAt: timestamp('acked_at', tz),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [index('alerts_detection_id_idx').on(table.detectionId)],
);

/** "Our own dog" - species (+ optional zone/time window) that never alerts. */
export const ignoreList = pgTable(
  'ignore_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    farmId: uuid('farm_id')
      .notNull()
      .references(() => farms.id, { onDelete: 'cascade' }),
    species: text('species', { enum: SPECIES }).notNull(),
    zoneKind: text('zone_kind', { enum: ZONE_KINDS }),
    startHour: integer('start_hour'),
    endHour: integer('end_hour'),
    label: text('label'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  },
  (table) => [index('ignore_list_farm_id_idx').on(table.farmId)],
);

/**
 * The queue behind a fast webhook ack (F2 criterion 3).
 *
 * A deliberately ordinary table instead of pg-boss: PGlite (used in tests and
 * zero-config dev) is Postgres, but without pg-boss' LISTEN/NOTIFY surface.
 * The contract - enqueue a row now, work it later - is the same, so swapping
 * in pg-boss for deployment is a driver change, not a redesign.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<unknown>(),
    status: text('status', { enum: ['pending', 'running', 'done', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    runAt: timestamp('run_at', tz).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', tz),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (table) => [index('jobs_status_run_at_idx').on(table.status, table.runAt)],
);
