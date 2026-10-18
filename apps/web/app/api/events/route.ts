import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';

import { devices, events } from '@predator-guard/db';

import { getDb } from '@/lib/db';

/**
 * The event feed, newest first. This is the read surface the M1 gate is
 * checked against (and what F8's dashboard will build on): every accepted
 * webhook appears here with its device resolved when one is known.
 */

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request): Promise<NextResponse> {
  const db = await getDb();
  const limitParam = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.trunc(limitParam), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const rows = await db
    .select({
      id: events.id,
      eventType: events.eventType,
      eventClass: events.eventClass,
      ringDeviceId: events.ringDeviceId,
      deviceName: devices.name,
      farmId: events.farmId,
      occurredAt: events.occurredAt,
      receivedAt: events.receivedAt,
    })
    .from(events)
    .leftJoin(devices, eq(events.deviceId, devices.id))
    .orderBy(desc(events.occurredAt))
    .limit(limit);

  return NextResponse.json({ events: rows });
}
