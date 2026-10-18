import { NextResponse } from 'next/server';

import { computeLinkNonce } from '@predator-guard/ring';
import { SIM_ACCOUNT_ID } from '@predator-guard/sim';

import { loadConfig } from '@/lib/config';
import { getFakeRing } from '@/lib/sim';

/**
 * One-click bootstrap for the local demo (F10).
 *
 * Plays Ring's side of the account-linking flow: issue an authorization code,
 * deliver it to our Token Exchange URL over HTTP (as Ring's redirect would),
 * then hand back the Account Link URL a real Ring would redirect the user to.
 * The user still has to submit the sign-in form - this route never verifies a
 * nonce (F1 criterion 1).
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const config = loadConfig();
  if (!config.isSim) {
    return NextResponse.json(
      { error: 'sim_disabled', detail: 'Set RING_SIM=1 (or unset Ring credentials) to enable.' },
      { status: 404 },
    );
  }

  const code = getFakeRing().issueAuthorizationCode(SIM_ACCOUNT_ID);
  const exchange = await fetch(new URL('/api/ring/oauth/token', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!exchange.ok) {
    return NextResponse.json(
      { error: 'exchange_failed', detail: await exchange.text() },
      { status: 502 },
    );
  }

  // Same nonce math Ring uses; the time is what makes it single-use.
  const timeMs = Date.now();
  const nonce = computeLinkNonce(timeMs, SIM_ACCOUNT_ID, config.hmacKey);
  const linkUrl = `/auth/ring/link?nonce=${encodeURIComponent(nonce)}&time=${timeMs}`;

  return NextResponse.json({ status: 'ready_to_link', accountId: SIM_ACCOUNT_ID, linkUrl });
}
