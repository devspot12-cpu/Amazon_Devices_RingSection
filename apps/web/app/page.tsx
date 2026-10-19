import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';

import { devices, events } from '@predator-guard/db';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { ensureFarm } from '@/lib/farms';

import { SimTools } from './sim-tools';

/**
 * Predator Guard dashboard.
 *
 * M1 is link & listen: this page shows the linking state, the camera count,
 * and the live event feed an accepted webhook lands in. The full timeline and
 * heatmap arrive with F8.
 */

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);

  const deviceCount = farm
    ? (await db.select({ id: devices.id }).from(devices).where(eq(devices.farmId, farm.id))).length
    : 0;
  const recent = await db
    .select({
      id: events.id,
      eventType: events.eventType,
      eventClass: events.eventClass,
      ringDeviceId: events.ringDeviceId,
      receivedAt: events.receivedAt,
    })
    .from(events)
    .orderBy(desc(events.receivedAt))
    .limit(5);

  return (
    <main>
      <h1>Predator Guard</h1>
      <p>A species-aware predator alarm built on the Ring Partner API.</p>

      <h2>Ring account</h2>
      {farm ? (
        <p>
          Linked to <strong>{farm.name}</strong> (Ring account <code>{farm.ringAccountId ?? '?'}</code>
          ) · <Link href="/devices">{deviceCount} camera(s) — map zones</Link>
        </p>
      ) : (
        <p>Not linked yet.</p>
      )}
      {config.isSim ? (
        <>
          <p>
            Simulator mode: no Ring credentials are configured, so the flows below run against the
            bundled fake Ring API at <code>/api/sim</code>.
          </p>
          <SimTools />
        </>
      ) : (
        <p>Start the linking flow from the Ring app to connect an account.</p>
      )}

      <h2>Recent events</h2>
      {recent.length === 0 ? (
        <p>No events yet. Accepted webhooks appear here immediately.</p>
      ) : (
        <ul>
          {recent.map((event) => (
            <li key={event.id}>
              <code>{event.eventType}</code> ({event.eventClass}) from{' '}
              <code>{event.ringDeviceId || 'unknown device'}</code> at{' '}
              {event.receivedAt.toISOString()}
            </li>
          ))}
        </ul>
      )}

      <h2>Elsewhere</h2>
      <ul>
        <li>
          <Link href="/devices">Cameras &amp; zones</Link>
        </li>
        <li>
          <Link href="/live">Live watch &amp; captures</Link>
        </li>
        <li>
          Events API: <a href="/api/events">/api/events</a>
        </li>
        <li>
          Health check: <a href="/api/health">/api/health</a>
        </li>
        <li>
          Features and milestones: <code>docs/FEATURES.md</code>
        </li>
      </ul>
    </main>
  );
}
