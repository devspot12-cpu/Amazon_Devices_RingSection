import { NextResponse, after } from 'next/server';

import { loadConfig } from '@/lib/config';
import { getDb } from '@/lib/db';
import { drainJobs } from '@/lib/jobs';
import { createJobHandlers } from '@/lib/pipeline';
import { handleWebhookRequest } from '@/lib/webhook-handler';

/**
 * The Webhook URL (F2).
 *
 * Thin by design: read the raw bytes, hand them to the transport-free handler,
 * return its verdict. On acceptance the queued work is drained in `after()`,
 * so the response - the acknowledgement Ring measures - is never blocked by
 * downstream processing (F2 criterion 3).
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const config = loadConfig();
  const db = await getDb();

  const result = await handleWebhookRequest(rawBody, request.headers.get('x-signature'), {
    db,
    hmacKey: config.hmacKey,
  });

  if (result.status === 200) {
    after(async () => {
      try {
        await drainJobs(db, { handlers: createJobHandlers({ db }) });
      } catch (error) {
        console.error(
          JSON.stringify({
            stage: 'webhook.drain_failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    });
  }

  return NextResponse.json(result.body, { status: result.status });
}
