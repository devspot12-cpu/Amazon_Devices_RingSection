import { asc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { devices, zones } from '@predator-guard/db';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { ensureFarm } from '@/lib/farms';

import { LiveView } from './live-view';

export const dynamic = 'force-dynamic';

export default async function LivePage() {
  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return (
      <main>
        <h1>Live watch</h1>
        <p>
          No farm is linked yet. <Link href="/">Back to the dashboard</Link> and link a Ring
          account first.
        </p>
      </main>
    );
  }

  const rows = await db
    .select({
      ringDeviceId: devices.ringDeviceId,
      name: devices.name,
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
      <h1>Live watch</h1>
      <p>
        Farm: <strong>{farm.name}</strong> · frames come through the server (Ring blocks
        browser-side calls). When the camera has no live frame, the newest recorded event is
        shown instead.
      </p>

      {rows.length === 0 ? (
        <p>
          No cameras stored yet - <Link href="/devices">sync the device list</Link> first.
        </p>
      ) : (
        <LiveView
          devices={rows.map((row) => ({
            ringDeviceId: row.ringDeviceId,
            name: row.name === '' ? '(unnamed camera)' : row.name,
            zoneKind: row.zoneKind ?? null,
            online: row.online,
            e2ee: row.e2ee,
          }))}
        />
      )}

      <p>
        <Link href="/">Dashboard</Link> · <Link href="/devices">Cameras &amp; zones</Link>
      </p>
    </main>
  );
}
