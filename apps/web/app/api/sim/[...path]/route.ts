import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/config';
import { getFakeRing } from '@/lib/sim';

/**
 * The fake Ring Partner API, mounted (F10).
 *
 * `RING_API_BASE_URL` / `RING_OAUTH_BASE_URL` point here in simulator mode, so
 * the app's Ring client makes real HTTP calls against wire-shaped JSON:API
 * responses - configuration swaps the backend, no code fork (F10 criterion 4).
 * The handler routes on the inner path (`/oauth/`, `/v1/`, `/media/`), so the
 * `/api/sim` prefix is invisible to it and media redirects rebuild absolute
 * URLs from the request.
 */

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  if (!loadConfig().isSim) {
    return NextResponse.json(
      { error: 'sim_disabled', detail: 'The fake Ring API is only served in simulator mode.' },
      { status: 404 },
    );
  }
  return getFakeRing().handler(request);
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handle(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handle(request);
}
