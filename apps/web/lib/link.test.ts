import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDb, farms, ringTokens, type Db } from '@predator-guard/db';
import { computeLinkNonce } from '@predator-guard/ring';
import { createFakeRing, type FakeRing } from '@predator-guard/sim';

import { loadConfig } from './config';
import { completeRingLink } from './link';
import { createRingClient, storeUnclaimedToken } from './ring';

/**
 * The F1 linking flow against the fake Ring API: exchange a code, store the
 * token sealed and unclaimed, then match the nonce from a link URL and claim.
 *
 * Only the browser hop is skipped - every Ring call goes through the exact
 * client the routes use, against a fake that enforces the documented rules
 * (account_identifier must match the bearer, refresh tokens rotate).
 */

let db: Db;
let closeDb: () => Promise<void>;
const config = loadConfig({ NODE_ENV: 'test' });

const asFetch =
  (fake: FakeRing): typeof fetch =>
  (input, init) =>
    fake.handler(new Request(String(input), init));

function fakeWithAccount(accountId: string, accessTokenTtlSeconds = 4 * 60 * 60): FakeRing {
  return createFakeRing({
    accessTokenTtlSeconds,
    accounts: [{ accountId, name: 'Link Farmer', email: 'link@example.test', devices: [] }],
  });
}

/** Exactly what the token-exchange route does: code -> sealed unclaimed row. */
async function provisionUnclaimedToken(fake: FakeRing, accountId: string): Promise<string> {
  const code = fake.issueAuthorizationCode(accountId);
  const tokens = await createRingClient(config, asFetch(fake)).exchangeAuthorizationCode({ code });
  return storeUnclaimedToken(db, config, tokens);
}

const quiet = () => {
  // The link flow logs structured lines; tests keep the output clean.
};

beforeAll(async () => {
  const opened = await createDb({ pgliteDataDir: 'memory://' });
  db = opened.db;
  closeDb = opened.close;
});

afterAll(async () => {
  await closeDb();
});

describe('completeRingLink', () => {
  it('matches the nonce, claims the integration and binds the token to a farm', async () => {
    const accountId = 'link-account-1';
    const fake = fakeWithAccount(accountId);
    const tokenRowId = await provisionUnclaimedToken(fake, accountId);

    const timeMs = Date.now();
    const nonce = computeLinkNonce(timeMs, accountId, config.hmacKey);

    const result = await completeRingLink(
      db,
      config,
      { nonce, timeMs, farmName: 'Link Farm 1', ownerEmail: 'farmer1@example.test' },
      { fetchImpl: asFetch(fake), log: quiet },
    );

    expect(result).toEqual({ status: 'linked', farmId: expect.any(String), ringAccountId: accountId });

    // Farm created with the submitted identity and the server-side account id.
    const farmRows = await db.select().from(farms).where(eq(farms.ringAccountId, accountId));
    expect(farmRows).toHaveLength(1);
    expect(farmRows[0]!.name).toBe('Link Farm 1');

    // Token sealed row is claimed and bound to that farm.
    const tokenRow = (await db.select().from(ringTokens).where(eq(ringTokens.id, tokenRowId)))[0]!;
    expect(tokenRow.status).toBe('claimed');
    expect(tokenRow.farmId).toBe(farmRows[0]!.id);

    // The two-step claim completed on Ring's side.
    expect(fake.state.integrations.get(accountId)?.status).toBe('completed');
  });

  it('rejects a link time outside the 600 s window (stale and future) without claiming', async () => {
    const accountId = 'link-account-2';
    const fake = fakeWithAccount(accountId);
    const tokenRowId = await provisionUnclaimedToken(fake, accountId);

    for (const timeMs of [Date.now() - 601_000, Date.now() + 60_000]) {
      const nonce = computeLinkNonce(timeMs, accountId, config.hmacKey);
      const result = await completeRingLink(
        db,
        config,
        { nonce, timeMs, farmName: 'Stale Farm', ownerEmail: 'stale@example.test' },
        { fetchImpl: asFetch(fake), log: quiet },
      );
      expect(result).toEqual({ status: 'expired' });
    }

    const tokenRow = (await db.select().from(ringTokens).where(eq(ringTokens.id, tokenRowId)))[0]!;
    expect(tokenRow.status).toBe('unclaimed');
    expect(fake.state.integrations.get(accountId)).toBeUndefined();
  });

  it('finds no match for a nonce minted for another account', async () => {
    const accountId = 'link-account-3';
    const fake = fakeWithAccount(accountId);
    const tokenRowId = await provisionUnclaimedToken(fake, accountId);

    const timeMs = Date.now();
    const nonce = computeLinkNonce(timeMs, 'some-other-account', config.hmacKey);

    const result = await completeRingLink(
      db,
      config,
      { nonce, timeMs, farmName: 'No Match Farm', ownerEmail: 'nomatch@example.test' },
      { fetchImpl: asFetch(fake), log: quiet },
    );

    expect(result).toEqual({ status: 'no_match' });
    const tokenRow = (await db.select().from(ringTokens).where(eq(ringTokens.id, tokenRowId)))[0]!;
    expect(tokenRow.status).toBe('unclaimed');
    expect(fake.state.integrations.get(accountId)).toBeUndefined();
  });

  it('re-linking the same account reuses the existing farm', async () => {
    const accountId = 'link-account-4';
    const fake = fakeWithAccount(accountId);

    await provisionUnclaimedToken(fake, accountId);
    const firstTime = Date.now();
    const first = await completeRingLink(
      db,
      config,
      {
        nonce: computeLinkNonce(firstTime, accountId, config.hmacKey),
        timeMs: firstTime,
        farmName: 'Original Farm',
        ownerEmail: 'original@example.test',
      },
      { fetchImpl: asFetch(fake), log: quiet },
    );
    expect(first.status).toBe('linked');

    await provisionUnclaimedToken(fake, accountId);
    const secondTime = Date.now();
    const second = await completeRingLink(
      db,
      config,
      {
        nonce: computeLinkNonce(secondTime, accountId, config.hmacKey),
        timeMs: secondTime,
        farmName: 'Should Not Replace',
        ownerEmail: 'second@example.test',
      },
      { fetchImpl: asFetch(fake), log: quiet },
    );

    expect(second.status).toBe('linked');
    const farmRows = await db.select().from(farms).where(eq(farms.ringAccountId, accountId));
    expect(farmRows).toHaveLength(1);
    expect(farmRows[0]!.name).toBe('Original Farm');
    if (first.status === 'linked' && second.status === 'linked') {
      expect(second.farmId).toBe(first.farmId);
    }
  });

  it('refreshes a stale access token before matching (the exchange may be minutes old)', async () => {
    const accountId = 'link-account-5';
    // ttl 1 s: by the time the farmer submits the form (simulated two seconds
    // later) the stored access token is stale, so the nonce match can only
    // succeed through the refresh path.
    const fake = fakeWithAccount(accountId, 1);
    await provisionUnclaimedToken(fake, accountId);

    const nowMs = Date.now() + 2000;
    const timeMs = nowMs - 500;
    const result = await completeRingLink(
      db,
      config,
      {
        nonce: computeLinkNonce(timeMs, accountId, config.hmacKey),
        timeMs,
        farmName: 'Refresh Farm',
        ownerEmail: 'refresh@example.test',
      },
      { fetchImpl: asFetch(fake), log: quiet, nowMs },
    );

    expect(result).toEqual({ status: 'linked', farmId: expect.any(String), ringAccountId: accountId });
    expect(fake.state.integrations.get(accountId)?.status).toBe('completed');
  });
});
