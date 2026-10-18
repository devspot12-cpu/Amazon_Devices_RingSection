/**
 * The fake Ring Partner API (FEATURES.md F10).
 *
 * A fetch-compatible handler implementing the endpoints Predator Guard calls:
 * `/oauth/token` (code exchange and refresh), `/v1/users/me`, `/v1/devices`,
 * `/v1/accounts/me/app-integrations` and the image-download redirect. The app
 * mounts it under `/api/sim` (see apps/web) and points `RING_API_BASE_URL` /
 * `RING_OAUTH_BASE_URL` at that mount - real Ring is swapped in by
 * configuration only, never a code fork (F10 criterion 4).
 *
 * Wire-accurate shape is the point: JSON:API bodies, Bearer auth, 401 on an
 * expired token, 429/`Retry-After` NOT here (the client's retry policy is
 * tested directly with a scripted fetch). State lives in memory and resets on
 * restart - that is a feature for a demo.
 */

import { cannedFrame } from './frames.js';

export const SIM_ACCOUNT_ID = 'sim-account-1';
/** Device ids the planted stories and the generator refer to. */
export const SIM_DEVICES = {
  coop: 'sim-cam-coop',
  pasture: 'sim-cam-pasture',
  shed: 'sim-cam-shed',
  yard: 'sim-cam-yard',
} as const;

export interface FakeRingDevice {
  ringDeviceId: string;
  name: string;
  deviceType: string;
  online: boolean;
  e2ee: boolean;
  capabilities: unknown;
  configurations: unknown;
}

export interface FakeRingAccount {
  accountId: string;
  name: string;
  email: string;
  devices: FakeRingDevice[];
}

export interface FakeRingState {
  accounts: Map<string, FakeRingAccount>;
  accessTokens: Map<string, { accountId: string; expiresAt: number }>;
  refreshTokens: Map<string, string>;
  codes: Map<string, string>;
  integrations: Map<string, { status: string; nonce: string | null }>;
}

export interface CreateFakeRingOptions {
  /** Accounts the fake knows. Defaults to one account with the four farm cameras. */
  accounts?: FakeRingAccount[];
  /** Access-token TTL used by the fake (the real one is ~4 h). */
  accessTokenTtlSeconds?: number;
  /** Injectable clock for expiry tests. */
  now?: () => number;
}

export interface FakeRing {
  readonly state: FakeRingState;
  /** Fetch-compatible: mount it at a base URL and point the client at it. */
  handler(request: Request): Promise<Response>;
  /** Issue an authorization code - the "Ring redirects the user" step. */
  issueAuthorizationCode(accountId: string): string;
  /** Mint an access token directly (tests, demos, bootstrap). */
  issueAccessToken(accountId: string, ttlSeconds?: number): string;
}

const JPEG_HEAD = 'media/frames';

function defaultAccount(): FakeRingAccount {
  const camera = (ringDeviceId: string, name: string): FakeRingDevice => ({
    ringDeviceId,
    name,
    deviceType: 'camera',
    online: true,
    e2ee: false,
    capabilities: { video_codecs: ['H264'], motion_detection: true },
    configurations: { motion_detection: { enabled: 'on' } },
  });
  return {
    accountId: SIM_ACCOUNT_ID,
    name: 'Sim Farmer',
    email: 'sim-farmer@example.test',
    devices: [
      camera(SIM_DEVICES.coop, 'Coop camera'),
      camera(SIM_DEVICES.pasture, 'Pasture fence camera'),
      camera(SIM_DEVICES.shed, 'Feed shed camera'),
      camera(SIM_DEVICES.yard, 'Yard camera'),
    ],
  };
}

/**
 * The handler routes on the *inner* path: everything from `/oauth/`, `/v1/` or
 * `/media/` onwards. The mount prefix (`/api/sim`) is therefore invisible to
 * the routes, and media redirects can rebuild an absolute URL from the request.
 */
function innerPath(pathname: string): string | null {
  for (const marker of ['/oauth/', '/v1/', '/media/']) {
    const index = pathname.indexOf(marker);
    if (index >= 0) return pathname.slice(index);
  }
  return null;
}

export function createFakeRing(options: CreateFakeRingOptions = {}): FakeRing {
  const now = options.now ?? Date.now;
  const accessTokenTtlSeconds = options.accessTokenTtlSeconds ?? 4 * 60 * 60;
  const state: FakeRingState = {
    accounts: new Map(),
    accessTokens: new Map(),
    refreshTokens: new Map(),
    codes: new Map(),
    integrations: new Map(),
  };
  for (const account of options.accounts ?? [defaultAccount()]) {
    state.accounts.set(account.accountId, account);
  }

  let tokenCounter = 0;
  const nextToken = (kind: 'access' | 'refresh', accountId: string): string => {
    tokenCounter += 1;
    return `fake-${kind}-${accountId}-${tokenCounter}`;
  };

  const json = (status: number, body: unknown): Response =>
    Response.json(body, { status, headers: { 'content-type': 'application/json' } });

  const fail = (status: number, title: string, detail: string): Response =>
    json(status, { errors: [{ status: String(status), title, detail }] });

  function issueAccessToken(accountId: string, ttlSeconds: number = accessTokenTtlSeconds): string {
    if (!state.accounts.has(accountId)) throw new Error(`Unknown fake account: ${accountId}`);
    const token = nextToken('access', accountId);
    state.accessTokens.set(token, { accountId, expiresAt: now() + ttlSeconds * 1000 });
    return token;
  }

  function issueAuthorizationCode(accountId: string): string {
    if (!state.accounts.has(accountId)) throw new Error(`Unknown fake account: ${accountId}`);
    tokenCounter += 1;
    const code = `fake-code-${accountId}-${tokenCounter}`;
    state.codes.set(code, accountId);
    return code;
  }

  function fromBearer(request: Request, allowExpired = false): string | Response {
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const record = state.accessTokens.get(token);
    if (!record) return fail(401, 'unauthorized', 'Missing or unknown access token');
    if (!allowExpired && record.expiresAt <= now()) {
      return fail(401, 'token_expired', 'Access token has expired - refresh it and retry');
    }
    return record.accountId;
  }

  async function readFields(request: Request): Promise<Record<string, string>> {
    const text = await request.text();
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('json')) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value),
            ]),
          );
        }
      } catch {
        return {};
      }
      return {};
    }
    const params = new URLSearchParams(text);
    return Object.fromEntries(params.entries());
  }

  async function handleToken(request: Request): Promise<Response> {
    const fields = await readFields(request);
    const grantType = fields.grant_type;
    let accountId: string | undefined;

    if (grantType === 'authorization_code') {
      const code = fields.code ?? '';
      accountId = state.codes.get(code);
      if (!accountId) return fail(400, 'invalid_grant', 'Unknown or already used authorization code');
      state.codes.delete(code);
    } else if (grantType === 'refresh_token') {
      const refresh = fields.refresh_token ?? '';
      accountId = state.refreshTokens.get(refresh);
      if (!accountId) return fail(400, 'invalid_grant', 'Unknown or expired refresh token');
      state.refreshTokens.delete(refresh);
    } else {
      return fail(400, 'unsupported_grant_type', `grant_type "${grantType ?? ''}" is not supported`);
    }

    const accessToken = issueAccessToken(accountId);
    const refreshToken = nextToken('refresh', accountId);
    state.refreshTokens.set(refreshToken, accountId);
    return json(200, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: accessTokenTtlSeconds,
      scope: 'device:read device:write',
      token_type: 'Bearer',
    });
  }

  function handleUsersMe(request: Request): Response {
    const accountId = fromBearer(request);
    if (accountId instanceof Response) return accountId;
    const account = state.accounts.get(accountId)!;
    return json(200, {
      data: {
        id: account.accountId,
        type: 'users',
        attributes: { name: account.name, email: account.email },
      },
    });
  }

  function handleListDevices(request: Request): Response {
    const accountId = fromBearer(request);
    if (accountId instanceof Response) return accountId;
    const account = state.accounts.get(accountId)!;
    return json(200, {
      data: account.devices.map((device) => ({
        id: device.ringDeviceId,
        type: 'devices',
        attributes: {
          name: device.name,
          device_type: device.deviceType,
          online: device.online,
        },
      })),
      included: account.devices.flatMap((device) => [
        { id: device.ringDeviceId, type: 'status', attributes: { online: device.online } },
        {
          id: device.ringDeviceId,
          type: 'capabilities',
          attributes: device.capabilities as object,
        },
        {
          id: device.ringDeviceId,
          type: 'configurations',
          attributes: {
            ...(device.configurations as object),
            e2e_encryption: { enabled: device.e2ee },
          },
        },
      ]),
    });
  }

  async function handleIntegration(request: Request, method: string): Promise<Response> {
    const accountId = fromBearer(request);
    if (accountId instanceof Response) return accountId;
    const account = state.accounts.get(accountId)!;

    if (method === 'POST') {
      const body = await readFields(request);
      const identifier = body.account_identifier ?? '';
      const nonce = body.nonce ?? '';
      if (identifier !== accountId) {
        return fail(403, 'account_mismatch', 'account_identifier does not match the access token');
      }
      if (!nonce) return fail(400, 'nonce_required', 'A link nonce is required');
      state.integrations.set(accountId, { status: 'awaiting', nonce });
      return json(201, {
        data: {
          id: accountId,
          type: 'app-integrations',
          attributes: { status: 'awaiting' },
        },
      });
    }

    if (method === 'PATCH') {
      const existing = state.integrations.get(accountId);
      if (!existing) {
        return fail(409, 'not_awaiting', 'No integration is awaiting completion for this account');
      }
      const body = await readFields(request);
      if (body.status !== 'completed') {
        return fail(400, 'invalid_status', 'PATCH supports only status="completed"');
      }
      existing.status = 'completed';
      return json(200, {
        data: {
          id: accountId,
          type: 'app-integrations',
          attributes: { status: 'completed' },
        },
      });
    }

    // DELETE - unlink.
    const existing = state.integrations.get(accountId);
    if (existing) existing.status = 'removed';
    return new Response(null, { status: 204 });
  }

  function handleImageDownload(request: Request, device: string): Response {
    const accountId = fromBearer(request);
    if (accountId instanceof Response) return accountId;
    const account = state.accounts.get(accountId)!;
    if (!account.devices.some((candidate) => candidate.ringDeviceId === device)) {
      return fail(404, 'device_not_found', `No device ${device} on this account`);
    }
    // Mirror the real flow: 303 + Location of a short-lived pre-signed URL.
    const url = new URL(request.url);
    const prefix = url.pathname.slice(0, url.pathname.indexOf('/v1/') + 1);
    const location = `${url.origin}${prefix}${JPEG_HEAD}/${encodeURIComponent(device)}.jpg?type=latest_in_range`;
    return new Response(null, { status: 303, headers: { location } });
  }

  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = innerPath(url.pathname);
    const method = request.method.toUpperCase();
    if (!path) return fail(404, 'not_found', `No fake Ring route for ${method} ${url.pathname}`);

    try {
      if (path === '/oauth/token' && method === 'POST') return await handleToken(request);
      if (path === '/v1/users/me' && method === 'GET') return handleUsersMe(request);
      if (path === '/v1/devices' && method === 'GET') return handleListDevices(request);
      if (path === '/v1/accounts/me/app-integrations' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
        return await handleIntegration(request, method);
      }
      const media = path.match(/^\/v1\/devices\/([^/]+)\/media\/image\/download$/);
      if (media && method === 'POST') return handleImageDownload(request, decodeURIComponent(media[1]!));
      const frame = path.match(/^\/media\/frames\/([^/]+)\.jpg$/);
      if (frame && method === 'GET') {
        const { bytes, contentType } = cannedFrame();
        // `new Uint8Array(bytes)` copies into an exactly-sized ArrayBuffer:
        // under the DOM lib (the web app compiles this file too) a
        // `Uint8Array<ArrayBufferLike>` is not a valid `BodyInit`, while a
        // plain `ArrayBuffer` is valid in both the DOM and Node typings.
        return new Response(new Uint8Array(bytes).buffer, {
          status: 200,
          headers: { 'content-type': contentType },
        });
      }
      return fail(404, 'not_found', `No fake Ring route for ${method} ${path}`);
    } catch (error) {
      return fail(500, 'sim_error', error instanceof Error ? error.message : String(error));
    }
  }

  return { state, handler: route, issueAuthorizationCode, issueAccessToken };
}
