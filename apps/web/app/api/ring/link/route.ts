import { NextResponse } from 'next/server';
import { z } from 'zod';

import { RingApiError } from '@predator-guard/ring';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { completeRingLink } from '@/lib/link';

/**
 * The sign-in submission behind `GET /auth/ring/link` (F1).
 *
 * The page only *renders* the form; this route is where a link is verified.
 * The nonce is matched server-side against unclaimed tokens, the account id
 * comes from Ring (`GET /v1/users/me`), and only on a match does the farm get
 * bound (criterion 4).
 */

export const dynamic = 'force-dynamic';

const linkRequestSchema = z.object({
  nonce: z.string().min(1),
  /** `time` arrives as a string from the URL; coerce once, validate here. */
  time: z.coerce.number().int().nonnegative(),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const parsed = linkRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_request', detail: 'A name and a valid email address are required.' },
      { status: 400 },
    );
  }

  const config = loadConfig();
  const db = await getDb();
  try {
    const result = await completeRingLink(db, config, {
      nonce: parsed.data.nonce,
      timeMs: parsed.data.time,
      farmName: parsed.data.name,
      ownerEmail: parsed.data.email,
    });

    switch (result.status) {
      case 'linked':
        return NextResponse.json(result, { status: 200 });
      case 'expired':
        // Criterion 2: readable error for stale (or future) links.
        return NextResponse.json(
          { error: 'expired', detail: 'This link expired after 10 minutes. Start the link again from Ring.' },
          { status: 410 },
        );
      case 'no_match':
        return NextResponse.json(
          {
            error: 'no_match',
            detail: 'No pending Ring authorization matches this link. Start the link again from Ring.',
          },
          { status: 409 },
        );
    }
  } catch (error) {
    if (error instanceof RingApiError) {
      return NextResponse.json({ error: 'ring_error', detail: error.message }, { status: 502 });
    }
    throw error;
  }
}
