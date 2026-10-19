import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { getDeviceDetails } from '@/lib/devices';
import { ensureFarm } from '@/lib/farms';
import { describeRingError } from '@/lib/ring';

/** `GET /api/devices/{ringDeviceId}` invokes Ring's device-details endpoint. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ ringDeviceId: string }> },
): Promise<NextResponse> {
  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }

  const { ringDeviceId } = await context.params;
  try {
    const device = await getDeviceDetails(db, config, { farmId: farm.id, ringDeviceId });
    if (!device) {
      return NextResponse.json(
        { error: 'device_not_found', detail: `Device ${ringDeviceId} is not known to this farm.` },
        { status: 404 },
      );
    }
    return NextResponse.json(device);
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
