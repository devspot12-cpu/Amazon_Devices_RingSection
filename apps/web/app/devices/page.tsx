import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';

import { devices, zones } from '@predator-guard/db';
import type { ZoneKind } from '@predator-guard/ring';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { ensureFarm } from '@/lib/farms';

import { DeviceDetails } from './device-details';
import { SyncButton } from './sync-button';
import { ZoneSelect } from './zone-select';

/**
 * Cameras and zones (F3 criterion 3). A server component: it reads the farm's
 * devices straight from the database, and the two client bits (sync, zone
 * selectors) call the API routes and refresh.
 */

export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
  const db = await getDb();
  const farm = await ensureFarm(db, loadConfig());

  if (!farm) {
    return (
      <main>
        <h1>Cameras &amp; zones</h1>
        <p role="alert">
          No farm is linked yet. Link your Ring account first (the dashboard has the simulator
          shortcut when running locally).
        </p>
        <p>
          <Link href="/">Back to the dashboard</Link>
        </p>
      </main>
    );
  }

  const rows = await db
    .select({
      id: devices.id,
      ringDeviceId: devices.ringDeviceId,
      name: devices.name,
      deviceType: devices.deviceType,
      online: devices.online,
      e2ee: devices.e2ee,
      zoneKind: zones.kind,
    })
    .from(devices)
    .leftJoin(zones, eq(devices.zoneId, zones.id))
    .where(eq(devices.farmId, farm.id))
    .orderBy(asc(devices.name));

  return (
    <main>
      <h1>Cameras &amp; zones</h1>
      <p>
        Farm: <strong>{farm.name}</strong> · Ring account:{' '}
        <code>{farm.ringAccountId ?? 'not linked'}</code>
      </p>
      <SyncButton />

      {rows.length === 0 ? (
        <p>No cameras stored yet - run a sync to pull the device list from Ring.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Camera</th>
              <th>Ring id</th>
              <th>Status</th>
              <th>Zone</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name || '(unnamed)'}</td>
                <td>
                  <code>{row.ringDeviceId}</code>
                </td>
                <td>
                  {row.online ? 'online' : 'offline'}
                  {row.e2ee ? ' · E2EE (media unreadable)' : ''}
                </td>
                <td>
                  <ZoneSelect
                    ringDeviceId={row.ringDeviceId}
                    current={(row.zoneKind as ZoneKind | null) ?? null}
                  />
                </td>
                <td>
                  <DeviceDetails ringDeviceId={row.ringDeviceId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p>
        <Link href="/">Back to the dashboard</Link>
      </p>
    </main>
  );
}
