import { NextResponse } from 'next/server';

/**
 * Liveness probe. Must stay dependency-free: the container health check calls it, and
 * it is the one endpoint that should answer even when the database is down.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ status: 'ok', service: 'predator-guard' });
}
