import { NextResponse } from 'next/server';

import { RingApiError } from '@predator-guard/ring';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { syncDevices } from '@/lib/devices';
import { ensureFarm } from '@/lib/farms';
import { RelinkRequiredError } from '@/lib/ring';

/**
 * `POST /api/devices/sync` (F3): refresh the farm's cameras from
 * `GET /v1/devices?include=status,capabilities,location,configurations`.
 * The token is refreshed first when needed; a dead Ring session surfaces as a
 * readable "re-link" state, never a 500 (F1 criterion 7).
 */

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
    if (error instanceof RelinkRequiredError) {
      return NextResponse.json({ error: 'relink_required', detail: error.message }, { status: 409 });
    }
    if (error instanceof RingApiError) {
      if (error.status === 401) {
        // Playground tokens die after ~30 minutes; say exactly what to do
        // instead of the bare "Ring API 401" the client produces (friction log).
        const detail = config.ringAccessToken
          ? 'Ring rejected RING_ACCESS_TOKEN (401). Playground tokens last ~30 minutes - generate a fresh one and paste it into apps/web/.env.local.'
          : 'Ring rejected the stored access token (401). Re-link the Ring account.';
        return NextResponse.json({ error: 'ring_token_expired', detail }, { status: 401 });
      }
      return NextResponse.json({ error: 'ring_error', detail: error.message }, { status: 502 });
    }
    throw error;
  }
}
