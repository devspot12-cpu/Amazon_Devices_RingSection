import { RingClient } from '@predator-guard/ring';
import { describe, expect, it } from 'vitest';

import { SIM_ACCOUNT_ID, SIM_DEVICES, createFakeRing, type FakeRing } from './fake-ring.js';

const BASE = 'http://sim.test/api/sim';

/** Adapt the fake handler into a fetch the Ring client can use directly. */
function simFetch(fake: FakeRing): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    return fake.handler(new Request(url, init as RequestInit));
  }) as typeof fetch;
}

function clientFor(fake: FakeRing): RingClient {
  return new RingClient({
    clientId: 'sim-client',
    clientSecret: 'sim-secret',
    apiBaseUrl: BASE,
    oauthBaseUrl: BASE,
    fetchImpl: simFetch(fake),
    sleep: async () => {},
  });
}

describe('fake Ring API', () => {
  it('runs the whole link flow: code, tokens, profile, devices, integration, unlink', async () => {
    const fake = createFakeRing();
    const client = clientFor(fake);

    const tokens = await client.exchangeAuthorizationCode({
      code: fake.issueAuthorizationCode(SIM_ACCOUNT_ID),
    });
    expect(tokens.accessToken).toMatch(/^fake-access-/);
    expect(tokens.refreshToken).toMatch(/^fake-refresh-/);
    expect(tokens.expiresInSeconds).toBe(14400);

    const profile = await client.getUsersMe(tokens.accessToken);
    expect(profile.accountId).toBe(SIM_ACCOUNT_ID);

    const devices = await client.listDevices(tokens.accessToken);
    expect(devices.map((device) => device.ringDeviceId)).toEqual([
      SIM_DEVICES.coop,
      SIM_DEVICES.pasture,
      SIM_DEVICES.shed,
      SIM_DEVICES.yard,
    ]);
    expect(devices[0]).toMatchObject({ name: 'Coop camera', online: true, e2ee: false });

    const created = await client.createIntegration(tokens.accessToken, {
      accountIdentifier: profile.accountId,
      nonce: 'nonce-1',
    });
    expect(created.status).toBe('awaiting');

    const completed = await client.completeIntegration(tokens.accessToken);
    expect(completed.status).toBe('completed');
    expect(fake.state.integrations.get(SIM_ACCOUNT_ID)?.status).toBe('completed');

    await client.deleteIntegration(tokens.accessToken);
    expect(fake.state.integrations.get(SIM_ACCOUNT_ID)?.status).toBe('removed');
  });

  it('rotates refresh tokens - the old one stops working', async () => {
    const fake = createFakeRing();
    const client = clientFor(fake);
    const tokens = await client.exchangeAuthorizationCode({
      code: fake.issueAuthorizationCode(SIM_ACCOUNT_ID),
    });

    const refreshed = await client.refreshAccessToken(tokens.refreshToken!);
    expect(refreshed.accessToken).not.toBe(tokens.accessToken);
    await expect(client.refreshAccessToken(tokens.refreshToken!)).rejects.toThrow(/400/);
  });

  it('rejects an expired access token with a 401 JSON:API error', async () => {
    const fake = createFakeRing({ accessTokenTtlSeconds: 0 });
    const client = clientFor(fake);
    const token = fake.issueAccessToken(SIM_ACCOUNT_ID);
    await expect(client.getUsersMe(token)).rejects.toThrow(/401/);
  });

  it('serves an image snapshot as 303 to a real JPEG', async () => {
    const fake = createFakeRing();
    const client = clientFor(fake);
    const tokens = await client.exchangeAuthorizationCode({
      code: fake.issueAuthorizationCode(SIM_ACCOUNT_ID),
    });

    const download = await simFetch(fake)(`${BASE}/v1/devices/${SIM_DEVICES.coop}/media/image/download`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(download.status).toBe(303);
    const location = download.headers.get('location')!;
    expect(location).toContain(`/api/sim/media/frames/${SIM_DEVICES.coop}.jpg`);

    const frame = await simFetch(fake)(location);
    expect(frame.status).toBe(200);
    expect(frame.headers.get('content-type')).toBe('image/jpeg');
    const bytes = new Uint8Array(await frame.arrayBuffer());
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8); // JPEG SOI - a real decodable frame, not a stub string
  });

  it('answers unknown routes with a 404 JSON:API error', async () => {
    const fake = createFakeRing();
    const response = await fake.handler(new Request(`${BASE}/not-a-route`));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { errors: Array<{ title: string }> };
    expect(body.errors[0]!.title).toBe('not_found');
  });
});
