import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { syncDevices } from '@/lib/devices';
import { ensureFarm } from '@/lib/farms';
import { describeRingError } from '@/lib/ring';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  const db = await getDb();
  const config = loadConfig();
  const farm = await ensureFarm(db, config);
  if (!farm) {
    return NextResponse.json(
      { error: 'no_farm', detail: 'No farm is linked yet. Link a Ring account first.' },
      { status: 409 },
    );
  }

  try {
    const result = await syncDevices(db, config, { farmId: farm.id });
    return NextResponse.json({ status: 'synced', ...result });
  } catch (error) {
    const described = describeRingError(error, config);
    if (described) {
      return NextResponse.json(described.body, { status: described.status });
    }
    throw error;
  }
}
