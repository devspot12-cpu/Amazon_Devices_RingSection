import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ZONE_KINDS } from '@predator-guard/ring';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { assignDeviceZone } from '@/lib/devices';
import { ensureFarm } from '@/lib/farms';

/**
 * `POST /api/devices/{ringDeviceId}/zone` (F3 criterion 3): map a camera to a
 * zone, or unmap it with `zoneKind: null`. Zones are per farm and unique by
 * kind, so several cameras in the coop share one zone row.
 */

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  zoneKind: z.enum(ZONE_KINDS).nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ ringDeviceId: string }> },
): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', detail: `zoneKind must be one of ${ZONE_KINDS.join(', ')} or null.` },
      { status: 400 },
    );
  }

  const db = await getDb();
  const farm = await ensureFarm(db, loadConfig());
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }

  const { ringDeviceId } = await context.params;
  const result = await assignDeviceZone(db, farm.id, ringDeviceId, parsed.data.zoneKind);
  if (!result) {
    return NextResponse.json(
      { error: 'device_not_found', detail: `Device ${ringDeviceId} is not known to this farm.` },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: 'mapped', ...result });
}
