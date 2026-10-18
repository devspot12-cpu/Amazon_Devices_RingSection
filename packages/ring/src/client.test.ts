import { describe, expect, it } from 'vitest';

import {
  RingApiError,
  RingClient,
  parseIntegrationState,
  parseRetryAfter,
  parseRingDevices,
} from './client.js';

/** Build a Response the way fetch would hand one back. */
function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

interface RecordedCall {
  url: string;
  init: RequestInit;
}

/** A fetch stand-in that replays a script of responses, recording every call. */
function scriptedFetch(steps: Array<() => Response | Promise<Response>>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const queue = [...steps];
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls.push({ url: String(input), init: init ?? {} });
    const step = queue.shift();
    if (!step) throw new Error('fetch called more times than the script allows');
    return step();
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(fetchImpl: typeof fetch, sleeps: number[] = []): RingClient {
  return new RingClient({
    clientId: 'client-id-1',
    clientSecret: 'client-secret-1',
    apiBaseUrl: 'https://api.ring.test',
    oauthBaseUrl: 'https://oauth.ring.test',
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
}

describe('token exchange and refresh', () => {
  it('exchanges an authorization code with form-encoded client credentials', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(200, {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 14400,
          scope: 'device:read',
          token_type: 'Bearer',
        }),
    ]);
    const tokens = await makeClient(fetchImpl).exchangeAuthorizationCode({ code: 'code-1' });

    expect(tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 14400,
      scope: 'device:read',
      tokenType: 'Bearer',
    });
    const call = calls[0]!;
    expect(call.url).toBe('https://oauth.ring.test/oauth/token');
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const body = new URLSearchParams(String(call.init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('client_id')).toBe('client-id-1');
    expect(body.get('client_secret')).toBe('client-secret-1');
  });

  it('refreshes with grant_type=refresh_token and tolerates a missing new refresh token', async () => {
    const { fetchImpl, calls } = scriptedFetch([() => jsonResponse(200, { access_token: 'access-2' })]);
    const tokens = await makeClient(fetchImpl).refreshAccessToken('refresh-1');
    expect(tokens.accessToken).toBe('access-2');
    expect(tokens.refreshToken).toBeNull();
    expect(new URLSearchParams(String(calls[0]!.init.body)).get('grant_type')).toBe('refresh_token');
  });

  it('rejects a token response without an access token', async () => {
    const { fetchImpl } = scriptedFetch([() => jsonResponse(200, { scope: 'x' })]);
    await expect(makeClient(fetchImpl).refreshAccessToken('r')).rejects.toThrow(/access_token/);
  });
});

describe('retry policy', () => {
  it('honours Retry-After seconds on 429, then succeeds', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse(429, { errors: [{ status: '429', title: 'Too Many Requests' }] }, { 'retry-after': '2' }),
      () => jsonResponse(200, { access_token: 'access-3' }),
    ]);
    const sleeps: number[] = [];
    const tokens = await makeClient(fetchImpl, sleeps).refreshAccessToken('r');
    expect(tokens.accessToken).toBe('access-3');
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it('backs off exponentially on 5xx', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse(503, {}),
      () => jsonResponse(502, {}),
      () => jsonResponse(200, { access_token: 'access-4' }),
    ]);
    const sleeps: number[] = [];
    await makeClient(fetchImpl, sleeps).refreshAccessToken('r');
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([250, 500]);
  });

  it('does not retry a 4xx and surfaces the JSON:API error', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(403, {
          errors: [{ status: '403', title: 'Forbidden', detail: 'the app lacks this scope' }],
        }),
    ]);
    const error = await makeClient(fetchImpl)
      .getUsersMe('access-x')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RingApiError);
    const apiError = error as RingApiError;
    expect(apiError.status).toBe(403);
    expect(apiError.title).toBe('Forbidden');
    expect(apiError.detail).toBe('the app lacks this scope');
    expect(calls).toHaveLength(1);
  });

  it('gives up after the final transport error', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => {
        throw new Error('ECONNREFUSED');
      },
      () => {
        throw new Error('ECONNREFUSED');
      },
    ]);
    const sleeps: number[] = [];
    const client = new RingClient({
      clientId: 'c',
      clientSecret: 's',
      fetchImpl,
      maxRetries: 1,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await expect(client.refreshAccessToken('r')).rejects.toThrow(/unreachable/);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([250]);
  });
});

describe('users, devices and integrations', () => {
  it('reads the account id from GET /v1/users/me with a bearer token', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: { id: 'acct-1', type: 'users', attributes: { name: 'Suchet', email: 's@example.com' } },
        }),
    ]);
    const profile = await makeClient(fetchImpl).getUsersMe('access-1');
    expect(profile).toEqual({ accountId: 'acct-1', name: 'Suchet', email: 's@example.com' });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.ring.test/v1/users/me');
    expect((call.init.headers as Record<string, string>).authorization).toBe('Bearer access-1');
  });

  it('joins first_name and last_name, as the docs return them', async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: {
            id: 'acct-2',
            type: 'users',
            attributes: { first_name: 'John', last_name: 'Doe', email: 'j@example.com' },
          },
        }),
    ]);
    const profile = await makeClient(fetchImpl).getUsersMe('access-2');
    expect(profile).toEqual({ accountId: 'acct-2', name: 'John Doe', email: 'j@example.com' });
  });

  it('lists devices, merging includes per device id (not per type)', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: [
            { id: 'dev-1', type: 'devices', attributes: { name: 'Coop cam', device_type: 'camera' } },
            { id: 'dev-2', type: 'devices', attributes: { name: 'Shed cam' } },
            { id: 'dev-3', type: 'devices', attributes: { name: 'Barn cam', e2ee: true } },
          ],
          included: [
            { id: 'dev-1', type: 'status', attributes: { online: true } },
            {
              id: 'dev-1',
              type: 'configurations',
              attributes: { e2e_encryption: { enabled: false } },
            },
            { id: 'dev-2', type: 'status', attributes: { online: false } },
            {
              id: 'dev-2',
              type: 'configurations',
              attributes: { e2e_encryption: { enabled: true } },
            },
            { id: 'dev-2', type: 'capabilities', attributes: { video_codecs: ['H264'] } },
          ],
        }),
    ]);
    const devices = await makeClient(fetchImpl).listDevices('access-1');

    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({
      ringDeviceId: 'dev-1',
      name: 'Coop cam',
      online: true,
      e2ee: false,
      capabilities: null,
    });
    // dev-2's data must come from dev-2's includes, never from dev-1's - the
    // E2EE flag decides whether media is fetched at all (F3 criterion 2).
    expect(devices[1]).toMatchObject({
      ringDeviceId: 'dev-2',
      online: false,
      e2ee: true,
      capabilities: { video_codecs: ['H264'] },
    });
    // dev-3 has no includes: flattened attributes and the false default apply.
    expect(devices[2]).toMatchObject({ ringDeviceId: 'dev-3', online: false, e2ee: true });
    expect(calls[0]!.url).toContain('/v1/devices?include=');
    expect(decodeURIComponent(calls[0]!.url)).toContain('status,capabilities,location,configurations');
  });

  it('posts, patches and deletes the app integration', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () => jsonResponse(201, { data: { type: 'app-integrations', attributes: { status: 'awaiting' } } }),
      () => jsonResponse(200, { data: { type: 'app-integrations', attributes: { status: 'completed' } } }),
      () => new Response(null, { status: 204 }),
    ]);
    const client = makeClient(fetchImpl);

    const created = await client.createIntegration('access-1', {
      accountIdentifier: 'acct-1',
      nonce: 'nonce-1',
    });
    expect(created.status).toBe('awaiting');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.url).toBe('https://api.ring.test/v1/accounts/me/app-integrations');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      account_identifier: 'acct-1',
      nonce: 'nonce-1',
    });

    const completed = await client.completeIntegration('access-1');
    expect(completed.status).toBe('completed');
    expect(calls[1]!.init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ status: 'completed' });

    await client.deleteIntegration('access-1');
    expect(calls[2]!.init.method).toBe('DELETE');
  });
});

describe('parsers', () => {
  it('parseRetryAfter accepts seconds, HTTP dates, and rejects garbage', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(' 0 ')).toBe(0);
    const now = 1_000_000;
    const inFiveSeconds = new Date(now + 5_000).toUTCString();
    expect(parseRetryAfter(inFiveSeconds, now)).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('definitely not a date or number')).toBeNull();
  });

  it('parseRingDevices survives a payload with no data', () => {
    expect(parseRingDevices({})).toEqual([]);
    expect(parseRingDevices(null)).toEqual([]);
  });

  it('parseIntegrationState reads both JSON:API and flat replies', () => {
    expect(parseIntegrationState({ data: { attributes: { status: 'awaiting' } } }).status).toBe('awaiting');
    expect(parseIntegrationState({ status: 'completed' }).status).toBe('completed');
    expect(parseIntegrationState(undefined).status).toBe('unknown');
  });
});
