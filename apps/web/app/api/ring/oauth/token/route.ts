import { NextResponse } from 'next/server';

import { RingApiError } from '@predator-guard/ring';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { createRingClient, storeUnclaimedToken } from '@/lib/ring';

/**
 * The Token Exchange URL (F1).
 *
 * Ring hands us the one-time authorization code (valid ~60 s), we swap it for
 * tokens and persist them **sealed and unclaimed** - ownership is only proven
 * later by the nonce match behind the sign-in form, so nothing is bound to a
 * farm here.
 *
 * Both verbs do the same thing on purpose: the docs describe a browser
 * redirect carrying the code (GET), a server-side delivery would POST it, and
 * which one a live Ring uses cannot be verified without an approved app
 * (friction log). `code` is accepted from the query string, a form body or a
 * JSON body.
 */

export const dynamic = 'force-dynamic';

async function readCode(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get('code');
  if (fromQuery) return fromQuery;
  if (request.method !== 'POST') return null;

  const text = await request.text();
  if (!text) return null;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      const parsed: unknown = JSON.parse(text);
      const code = (parsed as { code?: unknown } | null)?.code;
      return typeof code === 'string' && code !== '' ? code : null;
    } catch {
      return null;
    }
  }
  const code = new URLSearchParams(text).get('code');
  return code && code !== '' ? code : null;
}

async function exchange(request: Request): Promise<NextResponse> {
  const code = await readCode(request);
  if (!code) {
    return NextResponse.json(
      { error: 'missing_code', detail: 'Expected an OAuth authorization code.' },
      { status: 400 },
    );
  }

  const config = loadConfig();
  const db = await getDb();
  try {
    const tokens = await createRingClient(config).exchangeAuthorizationCode({ code });
    await storeUnclaimedToken(db, config, tokens);
    console.info(JSON.stringify({ stage: 'ring.oauth', outcome: 'tokens_stored' }));
    return NextResponse.json({ status: 'tokens_stored', next: '/auth/ring/link' });
  } catch (error) {
    if (error instanceof RingApiError) {
      // The usual cause is an expired or already-used code (60 s, one-time).
      return NextResponse.json({ error: 'ring_error', detail: error.message }, { status: 502 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  return exchange(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return exchange(request);
}
