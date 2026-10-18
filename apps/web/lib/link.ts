import { desc, eq } from 'drizzle-orm';

import { ringTokens, type Db } from '@predator-guard/db';
import {
  RingApiError,
  computeLinkNonce,
  constantTimeEqual,
  decryptToken,
  isFreshLinkTime,
  parseTokenEncKey,
} from '@predator-guard/ring';

import type { RingConfig } from './config';
import { createFarm, findFarmByRingAccountId } from './farms';
import { RelinkRequiredError, bindTokenToFarm, createRingClient, refreshStoredAccessToken } from './ring';

/**
 * Account linking (FEATURES.md F1), the server-side half of the flow.
 *
 * Ring redirects the user to our Account Link URL with `nonce` + `time`; the
 * page renders a sign-in form and this module runs only when the form is
 * submitted. The nonce is matched against **unclaimed** tokens by recomputing
 * `HMAC-SHA256(K_hmac, "<time>:<account_id>")` per candidate account - the
 * account id always comes from `GET /v1/users/me` with the stored token,
 * never from the browser (that is the whole point of the nonce).
 */

export interface LinkRequest {
  nonce: string;
  /** `time` query parameter, epoch milliseconds. */
  timeMs: number;
  farmName: string;
  ownerEmail: string;
}

export type LinkResult =
  | { status: 'linked'; farmId: string; ringAccountId: string }
  | { status: 'expired' }
  | { status: 'no_match' };

export interface LinkOptions {
  fetchImpl?: typeof fetch;
  nowMs?: number;
  log?: (line: Record<string, unknown>) => void;
}

export async function completeRingLink(
  db: Db,
  config: RingConfig,
  request: LinkRequest,
  options: LinkOptions = {},
): Promise<LinkResult> {
  const nowMs = options.nowMs ?? Date.now();
  const log = options.log ?? ((line: Record<string, unknown>) => console.info(JSON.stringify(line)));

  // Criterion 2: older than 600 s or in the future is rejected before any work.
  if (!isFreshLinkTime(request.timeMs, nowMs)) {
    return { status: 'expired' };
  }

  const client = createRingClient(config, options.fetchImpl);
  const key = parseTokenEncKey(config.tokenEncKey);
  const candidates = await db
    .select()
    .from(ringTokens)
    .where(eq(ringTokens.status, 'unclaimed'))
    .orderBy(desc(ringTokens.createdAt));

  for (const row of candidates) {
    let accessToken: string;
    try {
      accessToken = decryptToken(row.accessEnc, key);
      // The exchange happens moments before linking, but a slow farmer can
      // still arrive with a stale access token - refresh it once, in place.
      if ((row.accessExpiresAt?.getTime() ?? 0) <= nowMs) {
        accessToken = await refreshStoredAccessToken(db, config, row, options.fetchImpl, nowMs);
      }
    } catch (error) {
      if (error instanceof RelinkRequiredError) {
        log({ stage: 'ring.link', candidate: row.id, outcome: 'refresh_failed' });
        continue;
      }
      throw error;
    }

    let accountId: string;
    try {
      // The only trustworthy source for `account_identifier` (F1 notes: never
      // take it from the browser).
      accountId = (await client.getUsersMe(accessToken)).accountId;
    } catch (error) {
      if (error instanceof RingApiError) {
        log({ stage: 'ring.link', candidate: row.id, outcome: 'users_me_failed', status: error.status });
        continue;
      }
      throw error;
    }

    // Criterion 3: URL-safe Base64 nonce, constant-time comparison.
    const expected = computeLinkNonce(request.timeMs, accountId, config.hmacKey);
    if (!constantTimeEqual(expected, request.nonce)) continue;

    // Criterion 4: the two-step claim, POST to `awaiting` then PATCH to
    // `completed` (Ring's docs call the PATCH mandatory).
    await client.createIntegration(accessToken, {
      accountIdentifier: accountId,
      nonce: request.nonce,
    });
    await client.completeIntegration(accessToken);

    const existing = await findFarmByRingAccountId(db, accountId);
    const farm =
      existing ??
      (await createFarm(db, {
        name: request.farmName,
        ownerEmail: request.ownerEmail,
        ringAccountId: accountId,
      }));
    await bindTokenToFarm(db, { tokenRowId: row.id, farmId: farm.id, ringAccountId: accountId });

    log({ stage: 'ring.link', outcome: 'linked', ringAccountId: accountId, farmId: farm.id });
    return { status: 'linked', farmId: farm.id, ringAccountId: accountId };
  }

  return { status: 'no_match' };
}
