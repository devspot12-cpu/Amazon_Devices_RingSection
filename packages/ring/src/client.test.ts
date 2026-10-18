import { describe, expect, it } from 'vitest';

import {
  RingApiError,
  RingClient,
  parseHistoryEvents,
  parseIntegrationState,
  parseRetryAfter,
  parseRingDevices,
  toEpochMs,
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

  it('resolves includes through relationship pointers, as the live API returns them', async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: [
            {
              id: 'dev-real',
              type: 'devices',
              attributes: { name: 'Playground Device', image_url: 'https://x/img.png' },
              relationships: {
                status: { data: { type: 'device-status', id: 'dev-real.status.1' } },
                capabilities: { data: { type: 'device-capabilities', id: 'dev-real.caps.1' } },
                location: { data: { type: 'locations', id: 'dev-real.loc.1' } },
                configurations: { data: { type: 'device-configurations', id: 'dev-real.conf.1' } },
              },
            },
          ],
          included: [
            { id: 'dev-real.status.1', type: 'device-status', attributes: { online: true } },
            {
              id: 'dev-real.caps.1',
              type: 'device-capabilities',
              attributes: { motion_detection: true },
            },
            { id: 'dev-real.loc.1', type: 'locations', attributes: { country: 'US' } },
            {
              id: 'dev-real.conf.1',
              type: 'device-configurations',
              attributes: { e2e_encryption: { enabled: false } },
            },
          ],
        }),
    ]);
    const devices = await makeClient(fetchImpl).listDevices('access-1');
    // The pointer ids are resource ids, never the device id: matching by
    // device id alone would have produced online=false against real Ring.
    expect(devices[0]).toMatchObject({
      ringDeviceId: 'dev-real',
      online: true,
      e2ee: false,
      capabilities: { motion_detection: true },
    });
  });

  it('falls back to defaults when relationship pointers have no included data', async () => {
    const { fetchImpl } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: [
            {
              id: 'dev-bare',
              type: 'devices',
              attributes: { name: 'Bare cam' },
              relationships: {
                status: { data: { type: 'device-status', id: 'dev-bare.status.1' } },
              },
            },
          ],
        }),
    ]);
    const devices = await makeClient(fetchImpl).listDevices('access-1');
    expect(devices[0]).toMatchObject({
      ringDeviceId: 'dev-bare',
      online: false,
      e2ee: false,
      capabilities: null,
    });
  });

  it('gets one device and its sub-resources the way the playground lists them', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(200, {
          data: { id: 'dev-1', type: 'devices', attributes: { name: 'Coop cam' } },
          included: [{ id: 'dev-1', type: 'status', attributes: { online: true } }],
        }),
      () =>
        jsonResponse(200, {
          data: { type: 'device-status', id: 'dev-1.status', attributes: { online: true, state: null } },
        }),
    ]);
    const client = makeClient(fetchImpl);

    const device = await client.getDevice('access-1', 'dev-1');
    expect(device).toMatchObject({ ringDeviceId: 'dev-1', name: 'Coop cam', online: true });
    expect(calls[0]!.url).toContain('/v1/devices/dev-1?include=');

    const status = await client.getDeviceResource('access-1', 'dev-1', 'status');
    expect(status.type).toBe('device-status');
    expect(status.attributes.online).toBe(true);
    expect(calls[1]!.url).toBe('https://api.ring.test/v1/devices/dev-1/status');
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

describe('timestamp normalisation', () => {
  it('toEpochMs accepts seconds, milliseconds and ISO strings', () => {
    expect(toEpochMs(1_792_235_985)).toBe(1_792_235_985_000);
    expect(toEpochMs(1_792_235_985_000)).toBe(1_792_235_985_000);
    expect(toEpochMs('1792235985')).toBe(1_792_235_985_000);
    expect(toEpochMs('2026-10-19T02:30:00.000Z')).toBe(Date.parse('2026-10-19T02:30:00.000Z'));
    expect(toEpochMs('')).toBeNull();
    expect(toEpochMs('soon')).toBeNull();
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs(undefined)).toBeNull();
  });
});

describe('event history', () => {
  /** Ring reports epoch ms (~1.79e12); anything below 1e12 is read as seconds. */
  const BASE_MS = 1_792_235_000_000;

  const eventRow = (
    id: string,
    start: number | string,
    subType: string | null = 'animal',
  ): Record<string, unknown> => ({
    id,
    type: 'events',
    attributes: {
      event_type: 'motion',
      sub_type: subType,
      start,
      ...(typeof start === 'number' ? { end: start + 10_000 } : {}),
    },
    relationships: { source: { data: { id: 'dev-1', type: 'devices' } } },
  });

  const historyBody = (rows: unknown[], next?: string): Record<string, unknown> => ({
    data: rows,
    ...(next === undefined ? {} : { links: { next } }),
  });

  it('pages through links.next in ascending order and stops at the since cursor', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        jsonResponse(
          200,
          historyBody(
            [eventRow('ev-3', BASE_MS + 3_000), eventRow('ev-2', BASE_MS + 2_000)],
            '/v1/history/devices/dev-1/events?page%5Bafter%5D=ev-2',
          ),
        ),
      () =>
        jsonResponse(
          200,
          historyBody(
            [eventRow('ev-1', BASE_MS + 1_000)],
            '/v1/history/devices/dev-1/events?page%5Bafter%5D=ev-1',
          ),
        ),
    ]);
    const events = await makeClient(fetchImpl).listHistoryEvents('access-1', 'dev-1', {
      sinceMs: BASE_MS + 1_500,
      eventTypes: ['motion.animal'],
    });

    expect(events.map((item) => item.eventId)).toEqual(['ev-2', 'ev-3']);
    expect(events[0]).toMatchObject({
      ringDeviceId: 'dev-1',
      eventType: 'motion',
      subType: 'animal',
      startMs: BASE_MS + 2_000,
      endMs: BASE_MS + 12_000,
    });
    // Page two offered a next link, but the cursor had already been reached.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(
      'https://api.ring.test/v1/history/devices/dev-1/events?event_types=motion.animal',
    );
    expect(calls[1]!.url).toBe(
      'https://api.ring.test/v1/history/devices/dev-1/events?page%5Bafter%5D=ev-2',
    );
  });

  it('caps pages when every page claims a next link', async () => {
    const steps = Array.from({ length: 12 }, (_, index) => () =>
      jsonResponse(200, historyBody([eventRow(`ev-${index}`, BASE_MS + index)], '/v1/history/next')),
    );
    const { fetchImpl, calls } = scriptedFetch(steps);
    const events = await makeClient(fetchImpl).listHistoryEvents('access-1', 'dev-1');
    expect(calls).toHaveLength(10);
    expect(events).toHaveLength(10);
  });

  it('parseHistoryEvents skips malformed rows and normalises ISO starts', () => {
    const iso = '2026-10-19T02:30:00.000Z';
    const parsed = parseHistoryEvents({
      data: [eventRow('ev-iso', iso, 'human'), { id: 'ev-bad' }, 'garbage'],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      eventId: 'ev-iso',
      subType: 'human',
      startMs: Date.parse(iso),
      endMs: null,
    });
    expect(parseHistoryEvents(null)).toEqual([]);
    expect(parseHistoryEvents({})).toEqual([]);
  });
});

describe('image snapshots', () => {
  const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

  function imageResponse(status: number, headers: Record<string, string> = {}): Response {
    const body = status >= 200 && status < 300 ? new Uint8Array(jpegBytes).buffer : null;
    return new Response(body, { status, headers: { 'content-type': 'image/jpeg', ...headers } });
  }

  it('requests at_timestamp, returns bytes and reads the audit headers', async () => {
    const { fetchImpl, calls } = scriptedFetch([
      () =>
        imageResponse(200, {
          'x-media-timestamp': '1792235985',
          'x-media-origin': 'snapshot',
          'x-request-id': 'req-1',
        }),
    ]);
    const snapshot = await makeClient(fetchImpl).fetchImageSnapshot('access-1', 'dev-1', {
      atMs: 1_792_236_000_000,
    });

    expect(snapshot?.bytes).toEqual(jpegBytes);
    expect(snapshot?.contentType).toBe('image/jpeg');
    expect(snapshot?.origin).toBe('snapshot');
    expect(snapshot?.requestId).toBe('req-1');
    expect(snapshot?.capturedAt?.getTime()).toBe(1_792_235_985_000);

    const call = calls[0]!;
    expect(call.url).toBe('https://api.ring.test/v1/devices/dev-1/media/image/download');
    expect(call.init.method).toBe('POST');
    expect((call.init.headers as Record<string, string>).accept).toContain('application/vnd.api+json');
    expect(JSON.parse(String(call.init.body))).toEqual({
      type: 'at_timestamp',
      timestamp: 1_792_236_000_000,
      image_options: { format: 'jpeg', resolution: { width: 1280, height: 720 } },
    });
  });

  it('supports latest_in_range with one component for multi-camera devices', async () => {
    const { fetchImpl, calls } = scriptedFetch([() => imageResponse(200)]);
    await makeClient(fetchImpl).fetchImageSnapshot('access-1', 'dev-1', {
      range: { startMs: 1_000, endMs: 2_000 },
      componentId: 'com-1',
      format: 'png',
      resolution: { width: 640, height: 360 },
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      type: 'latest_in_range',
      start_timestamp: 1_000,
      end_timestamp: 2_000,
      image_options: { format: 'png', resolution: { width: 640, height: 360 } },
      components: [{ component_id: 'com-1' }],
    });
  });

  it('returns null when no frame exists yet (403/416), never throws', async () => {
    const { fetchImpl } = scriptedFetch([
      () => new Response(null, { status: 416 }),
      () => new Response(null, { status: 403 }),
    ]);
    const client = makeClient(fetchImpl);
    expect(await client.fetchImageSnapshot('access-1', 'dev-1')).toBeNull();
    expect(await client.fetchImageSnapshot('access-1', 'dev-1')).toBeNull();
  });

  it('still throws on 401 so a dead token never reads as "no frame"', async () => {
    const { fetchImpl } = scriptedFetch([
      () => jsonResponse(401, { errors: [{ status: '401', title: 'Unauthorized' }] }),
    ]);
    const error = await makeClient(fetchImpl)
      .fetchImageSnapshot('access-1', 'dev-1')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RingApiError);
    expect((error as RingApiError).status).toBe(401);
  });
});
