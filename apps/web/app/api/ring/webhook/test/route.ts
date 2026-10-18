import { NextResponse } from 'next/server';
import { z } from 'zod';

import { SIM_ACCOUNT_ID, SIM_DEVICES, buildMotionWebhook, sendWebhook } from '@predator-guard/sim';

import { loadConfig } from '@/lib/config';

/**
 * Local demo trigger (F2 criterion 6): build a motion webhook, sign it
 * exactly like Ring does, and POST it to our own Webhook URL over HTTP.
 *
 * Going over the wire on purpose - raw bytes are signed and verified the way
 * a real delivery is, so this proves the production path, not a shortcut.
 * Refused outside simulator mode: a live app must not have a forge-me button.
 */

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  deviceId: z.string().min(1).optional(),
  subType: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const config = loadConfig();
  if (!config.isSim) {
    return NextResponse.json(
      { error: 'sim_disabled', detail: 'Set RING_SIM=1 (or unset Ring credentials) to enable.' },
      { status: 404 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const built = buildMotionWebhook({
    accountId: parsed.data.accountId ?? SIM_ACCOUNT_ID,
    deviceId: parsed.data.deviceId ?? SIM_DEVICES.yard,
    subType: parsed.data.subType ?? 'motion',
  });

  const url = new URL('/api/ring/webhook', request.url).toString();
  const delivery = await sendWebhook({ url, hmacKey: config.hmacKey, payload: built });

  let body: unknown = delivery.bodyText;
  try {
    body = JSON.parse(delivery.bodyText);
  } catch {
    // Keep the text when the receiver did not answer with JSON.
  }

  return NextResponse.json(
    { sent: true, webhook: { status: delivery.status, body } },
    { status: delivery.status === 200 ? 200 : 502 },
  );
}
