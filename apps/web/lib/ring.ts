import { and, desc, eq } from 'drizzle-orm';

import { farms, ringTokens, type Db } from '@predator-guard/db';
import {
  RingApiError,
  RingClient,
  decryptToken,
  encryptToken,
  parseTokenEncKey,
  type RingTokenSet,
} from '@predator-guard/ring';

import type { RingConfig } from './config';

/**
 * The app-side Ring module (FEATURES.md F1).
 *
 * `packages/ring` owns the wire protocol; this file owns what the web app does
 * with it: build a configured client and keep the sealed token store in sync.
 * Tokens are only ever plaintext inside these functions - they are sealed
 * (AES-256-GCM) the moment they touch a row and opened only when a request
 * needs to go out.
 */

/** Refresh an access token when it is within this many ms of expiry. */
export const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Thrown when Ring no longer accepts the stored refresh token (or there is no
 * stored token at all). Callers turn this into a readable "re-link your
 * account" state - never a 500 (F1 criterion 7).
 */
export class RelinkRequiredError extends Error {
  constructor(message = 'The Ring account must be linked again (refresh token rejected)') {
    super(message);
    this.name = 'RelinkRequiredError';
  }
}

/**
 * Translate a Ring failure into the `{ status, body }` shape every route
 * returns: "re-link the account" instead of a 500 (F1 criterion 7), an
 * actionable "token expired" message for pasted playground tokens, and a
 * plain 502 for everything else. Returns null for non-Ring errors -
 * callers rethrow those.
 */
export function describeRingError(
  error: unknown,
  config: RingConfig,
): { status: number; body: { error: string; detail: string } } | null {
  if (error instanceof RelinkRequiredError) {
    return { status: 409, body: { error: 'relink_required', detail: error.message } };
  }
  if (error instanceof RingApiError) {
    if (error.status === 401) {
      return {
        status: 401,
        body: {
          error: 'ring_token_expired',
          detail: config.ringAccessToken
            ? 'Ring rejected RING_ACCESS_TOKEN (401). Playground tokens last ~30 minutes - generate a fresh one on the Ring playground and paste it into apps/web/.env.local.'
            : 'Ring rejected the stored access token (401). Link the Ring account again.',
        },
      };
    }
    return { status: 502, body: { error: 'ring_error', detail: error.message } };
  }
  return null;
}

export function createRingClient(config: RingConfig, fetchImpl?: typeof fetch): RingClient {
  return new RingClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    apiBaseUrl: config.apiBaseUrl,
    oauthBaseUrl: config.oauthBaseUrl,
    fetchImpl,
  });
}

/**
 * Persist a freshly exchanged token set as **unclaimed**: no farm has proven
 * ownership of the account linking nonce yet (F1 criterion 3-5).
 * Returns the new row id; the link flow claims it later.
 */
export async function storeUnclaimedToken(
  db: Db,
  config: RingConfig,
  tokens: RingTokenSet,
  nowMs: number = Date.now(),
): Promise<string> {
  const key = parseTokenEncKey(config.tokenEncKey);
  const rows = await db
    .insert(ringTokens)
    .values({
      status: 'unclaimed',
      accessEnc: encryptToken(tokens.accessToken, key),
      refreshEnc: encryptToken(tokens.refreshToken ?? '', key),
      scopes: tokens.scope,
      accessExpiresAt: new Date(nowMs + tokens.expiresInSeconds * 1000),
    })
    .returning({ id: ringTokens.id });
  return rows[0]!.id;
}

/** Bind an unclaimed token row to a farm after a nonce match (F1 criterion 4). */
export async function bindTokenToFarm(
  db: Db,
  input: { tokenRowId: string; farmId: string; ringAccountId: string },
): Promise<void> {
  await db
    .update(ringTokens)
    .set({
      farmId: input.farmId,
      ringAccountId: input.ringAccountId,
      status: 'claimed',
      updatedAt: new Date(),
    })
    .where(eq(ringTokens.id, input.tokenRowId));
}

/** Unlink (F1 criterion 6): drop tokens and detach the farm from the account. */
export async function unlinkRingAccount(db: Db, ringAccountId: string): Promise<void> {
  await db.delete(ringTokens).where(eq(ringTokens.ringAccountId, ringAccountId));
  await db
    .update(farms)
    .set({ ringAccountId: null })
    .where(eq(farms.ringAccountId, ringAccountId));
}

export interface FreshAccessToken {
  accessToken: string;
  /** The stored token row, when the token came from the vault; null for `RING_ACCESS_TOKEN`. */
  tokenRowId: string | null;
}

export type TokenRow = typeof ringTokens.$inferSelect;

/**
 * Refresh one stored token row in place and return the new access token.
 *
 * The refresh token is single-use: the response's new refresh token replaces
 * the sealed one. 400/401 from the token endpoint means the refresh token is
 * dead - that is a "re-link" state, not an outage. Anything else (5xx,
 * network) bubbles up.
 */
export async function refreshStoredAccessToken(
  db: Db,
  config: RingConfig,
  row: TokenRow,
  fetchImpl?: typeof fetch,
  nowMs: number = Date.now(),
): Promise<string> {
  const key = parseTokenEncKey(config.tokenEncKey);
  const refreshToken = decryptToken(row.refreshEnc, key);
  if (!refreshToken) {
    throw new RelinkRequiredError('Stored Ring token set has no refresh token');
  }

  let refreshed: RingTokenSet;
  try {
    refreshed = await createRingClient(config, fetchImpl).refreshAccessToken(refreshToken);
  } catch (error) {
    if (error instanceof RingApiError && (error.status === 400 || error.status === 401)) {
      throw new RelinkRequiredError(`Ring rejected the stored refresh token (${error.status})`);
    }
    throw error;
  }

  await db
    .update(ringTokens)
    .set({
      accessEnc: encryptToken(refreshed.accessToken, key),
      refreshEnc: encryptToken(refreshed.refreshToken ?? refreshToken, key),
      accessExpiresAt: new Date(nowMs + refreshed.expiresInSeconds * 1000),
      updatedAt: new Date(),
    })
    .where(eq(ringTokens.id, row.id));

  return refreshed.accessToken;
}

/**
 * Return a usable access token for the farm's linked Ring account, refreshing
 * proactively before the ~4 h expiry (F1 criterion 7).
 *
 * `RING_ACCESS_TOKEN` short-circuits the vault entirely: one pasted token, no
 * link flow and no refresh - re-paste a fresh one when Ring expires it.
 */
export async function ensureFreshAccessToken(
  db: Db,
  config: RingConfig,
  farmId: string,
  options: { fetchImpl?: typeof fetch; nowMs?: number } = {},
): Promise<FreshAccessToken> {
  // shortcut: pasted tokens are never refreshed, re-paste when Ring answers 401;
  // upgrade by using the linked flow's vault refresh (below) per farm.
  if (config.ringAccessToken) {
    return { accessToken: config.ringAccessToken, tokenRowId: null };
  }

  const rows = await db
    .select()
    .from(ringTokens)
    .where(and(eq(ringTokens.farmId, farmId), eq(ringTokens.status, 'claimed')))
    .orderBy(desc(ringTokens.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new RelinkRequiredError('No linked Ring account for this farm');

  const nowMs = options.nowMs ?? Date.now();
  const expiresAtMs = row.accessExpiresAt?.getTime() ?? 0;
  if (expiresAtMs - nowMs > REFRESH_SKEW_MS) {
    const key = parseTokenEncKey(config.tokenEncKey);
    return { accessToken: decryptToken(row.accessEnc, key), tokenRowId: row.id };
  }

  const accessToken = await refreshStoredAccessToken(db, config, row, options.fetchImpl, nowMs);
  return { accessToken, tokenRowId: row.id };
}
