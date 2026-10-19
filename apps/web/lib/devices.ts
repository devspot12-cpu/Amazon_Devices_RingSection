import { and, eq } from 'drizzle-orm';

import { devices, zones, type Db } from '@predator-guard/db';
import type { ZoneKind } from '@predator-guard/ring';

import type { RingConfig } from './config';
import { createRingClient, ensureFreshAccessToken } from './ring';

/**
 * Device discovery and zone mapping (FEATURES.md F3).
 *
 * `syncDevices` refreshes the farm's cameras from Ring; `assignDeviceZone`
 * maps one camera to a zone. Both are plain functions over the database so
 * the routes stay thin and the tests run against a real PGlite database plus
 * the fake Ring API.
 */

/** Human labels for the four zone kinds. */
const ZONE_LABELS: Record<ZoneKind, string> = {
  coop: 'Coop',
  pasture: 'Pasture',
  shed: 'Feed shed',
  gate: 'Gate',
};

export function zoneLabel(kind: ZoneKind): string {
  return ZONE_LABELS[kind];
}

export interface SyncDevicesResult {
  farmId: string;
  /** How many devices Ring reported (each one upserted). */
  synced: number;
}

/**
 * Fetch `GET /v1/devices?include=...` and upsert every camera (name, online
 * status, capabilities, configurations, the E2EE flag), keeping any zone
 * mapping already made - the upsert never touches `zone_id`.
 */
export async function syncDevices(
  db: Db,
  config: RingConfig,
  options: { farmId: string; fetchImpl?: typeof fetch; nowMs?: number },
): Promise<SyncDevicesResult> {
  const nowMs = options.nowMs ?? Date.now();
  const { accessToken } = await ensureFreshAccessToken(db, config, options.farmId, {
    fetchImpl: options.fetchImpl,
    nowMs,
  });

  const ringDevices = await createRingClient(config, options.fetchImpl).listDevices(accessToken);

  for (const device of ringDevices) {
    const values = {
      farmId: options.farmId,
      ringDeviceId: device.ringDeviceId,
      name: device.name,
      deviceType: device.deviceType,
      online: device.online,
      e2ee: device.e2ee,
      capabilities: device.capabilities,
      configurations: device.configurations,
      lastSeenAt: new Date(nowMs),
      updatedAt: new Date(nowMs),
    };
    await db
      .insert(devices)
      .values(values)
      .onConflictDoUpdate({
        target: [devices.farmId, devices.ringDeviceId],
        set: {
          name: values.name,
          deviceType: values.deviceType,
          online: values.online,
          e2ee: values.e2ee,
          capabilities: values.capabilities,
          configurations: values.configurations,
          lastSeenAt: values.lastSeenAt,
          updatedAt: values.updatedAt,
        },
      });
  }

  return { farmId: options.farmId, synced: ringDevices.length };
}

/**
 * Invoke Ring's `GET /v1/devices/{id}` for a device already synced to this
 * farm. The caller can expose the parsed device, but never the access token.
 */
export async function getDeviceDetails(
  db: Db,
  config: RingConfig,
  options: { farmId: string; ringDeviceId: string; fetchImpl?: typeof fetch },
) {
  const knownDevice = await db
    .select({ id: devices.id })
    .from(devices)
    .where(
      and(
        eq(devices.farmId, options.farmId),
        eq(devices.ringDeviceId, options.ringDeviceId),
      ),
    )
    .limit(1);
  if (!knownDevice[0]) return null;

  const { accessToken } = await ensureFreshAccessToken(db, config, options.farmId, {
    fetchImpl: options.fetchImpl,
  });
  return createRingClient(config, options.fetchImpl).getDevice(accessToken, options.ringDeviceId);
}

export interface AssignZoneResult {
  deviceId: string;
  zoneId: string | null;
  zoneKind: ZoneKind | null;
}

/**
 * Map a camera to a zone (or clear it with `null`). Zones are per farm and
 * unique by kind, so assigning two cameras to "coop" reuses one zone row.
 * Returns `null` when the device is not known to this farm.
 */
export async function assignDeviceZone(
  db: Db,
  farmId: string,
  ringDeviceId: string,
  zoneKind: ZoneKind | null,
  nowMs: number = Date.now(),
): Promise<AssignZoneResult | null> {
  const deviceRows = await db
    .select()
    .from(devices)
    .where(and(eq(devices.farmId, farmId), eq(devices.ringDeviceId, ringDeviceId)))
    .limit(1);
  const device = deviceRows[0];
  if (!device) return null;

  if (zoneKind === null) {
    await db
      .update(devices)
      .set({ zoneId: null, updatedAt: new Date(nowMs) })
      .where(eq(devices.id, device.id));
    return { deviceId: device.id, zoneId: null, zoneKind: null };
  }

  const zoneRows = await db
    .insert(zones)
    .values({ farmId, kind: zoneKind, name: zoneLabel(zoneKind) })
    .onConflictDoUpdate({
      target: [zones.farmId, zones.kind],
      set: { name: zoneLabel(zoneKind) },
    })
    .returning({ id: zones.id });
  const zoneId = zoneRows[0]!.id;

  await db
    .update(devices)
    .set({ zoneId, updatedAt: new Date(nowMs) })
    .where(eq(devices.id, device.id));

  return { deviceId: device.id, zoneId, zoneKind };
}
