/**
 * The typed Ring Partner API client (FEATURES.md F1-F3).
 *
 * PLAN.md design rule 2: one module owns every outbound Ring call - typed,
 * retrying, token-aware. Design notes:
 *
 * - `fetch` is injected, so tests drive the exact production code with a
 *   scripted fake and no network. The fake Ring API in `@predator-guard/sim`
 *   speaks the same wire format.
 * - 429 retries honour `Retry-After` (seconds or HTTP date, capped); 5xx and
 *   transport errors retry with exponential backoff. 4xx (except 429) are
 *   permanent - Ring's docs treat them as such and retrying cannot help.
 * - Errors are parsed from Ring's JSON:API shape
 *   (`{"errors":[{"status","title","detail"}]}`) into a `RingApiError`.
 * - Every token comes from the caller: this client never stores secrets.
 *   Refresh scheduling and the sealed store live one layer up.
 */

export const DEFAULT_API_BASE_URL = 'https://api.amazonvision.com';
export const DEFAULT_OAUTH_BASE_URL = 'https://oauth.ring.com';

/** Fields requested by device discovery (docs: include=status,capabilities,location,configurations). */
export const DEVICE_INCLUDE = 'status,capabilities,location,configurations';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 250;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;

export interface RingTokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string | null;
  tokenType: string;
}

export interface RingUserProfile {
  accountId: string;
  name: string | null;
  email: string | null;
}

/** One camera from device discovery, with the raw item kept for the friction log. */
export interface RingDevice {
  ringDeviceId: string;
  name: string;
  deviceType: string | null;
  online: boolean;
  e2ee: boolean;
  capabilities: unknown;
  configurations: unknown;
  raw: unknown;
}

export interface RingIntegrationState {
  /** `awaiting | completed | removed`; `unknown` when the reply omits it. */
  status: string;
  raw: unknown;
}

export interface RingClientOptions {
  clientId: string;
  clientSecret: string;
  apiBaseUrl?: string;
  oauthBaseUrl?: string;
  /** Injectable for tests; defaults to a late-bound global fetch. */
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  retryBaseMs?: number;
  /** Upper bound for a single backoff/`Retry-After` sleep. */
  maxRetryDelayMs?: number;
  /** Injectable clock pause for tests; defaults to real `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

export class RingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly title: string | null = null,
    readonly detail: string | null = null,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = 'RingApiError';
  }
}

/**
 * Parse a `Retry-After` header - either delta-seconds or an HTTP date.
 * Returns milliseconds to wait, or null when absent/unparseable.
 */
export function parseRetryAfter(
  headerValue: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - nowMs);
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract JSON:API errors: `{"errors":[{"status","title","detail"}]}`. */
export function parseJsonApiErrors(
  body: unknown,
): Array<{ status: string | null; title: string | null; detail: string | null }> {
  if (!isRecord(body) || !Array.isArray(body.errors)) return [];
  return body.errors.filter(isRecord).map((error) => ({
    status: typeof error.status === 'string' ? error.status : null,
    title: typeof error.title === 'string' ? error.title : null,
    detail: typeof error.detail === 'string' ? error.detail : null,
  }));
}

function readOnline(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'online' || value === 'true';
  return false;
}

function readE2ee(attributes: Record<string, unknown>, configurations: Record<string, unknown>): boolean {
  const encryption = configurations.e2e_encryption;
  if (isRecord(encryption) && typeof encryption.enabled === 'boolean') return encryption.enabled;
  if (typeof attributes.e2ee === 'boolean') return attributes.e2ee;
  return false;
}

/**
 * Normalise `GET /v1/devices` into `RingDevice[]`.
 *
 * The include payload nests status/capabilities/configurations either as
 * `included` resources or flattened into `attributes` depending on the Ring
 * deployment; both are accepted, and `raw` keeps whatever arrived so a
 * surprise is debuggable rather than lost (friction log).
 *
 * Included resources are matched on **id and type**: matching on type alone
 * hands every camera the *first* camera's configurations, and with them the
 * wrong E2EE flag - which decides whether media is ever fetched (F3).
 */
export function parseRingDevices(payload: unknown): RingDevice[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const included = Array.isArray(payload.included) ? payload.included.filter(isRecord) : [];
  const attributesFor = (
    id: string,
    type: string,
  ): Record<string, unknown> | undefined => {
    const item = included.find((candidate) => candidate.id === id && candidate.type === type);
    return item && isRecord(item.attributes) ? item.attributes : undefined;
  };

  const devices: RingDevice[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) continue;
    const ringDeviceId = typeof item.id === 'string' ? item.id : '';
    if (!ringDeviceId) continue;
    const attributes = isRecord(item.attributes) ? item.attributes : {};
    const status = attributesFor(ringDeviceId, 'status') ?? {};
    const capabilities =
      attributesFor(ringDeviceId, 'capabilities') ??
      (isRecord(attributes.capabilities) ? attributes.capabilities : null);
    const configurations =
      attributesFor(ringDeviceId, 'configurations') ??
      (isRecord(attributes.configurations) ? attributes.configurations : {});

    devices.push({
      ringDeviceId,
      name: typeof attributes.name === 'string' ? attributes.name : '',
      deviceType: typeof attributes.device_type === 'string' ? attributes.device_type : null,
      online: readOnline(attributes.online ?? attributes.status ?? status.online),
      e2ee: readE2ee(attributes, configurations),
      capabilities,
      configurations,
      raw: item,
    });
  }
  return devices;
}

/** Normalise an app-integrations reply into `{status, raw}`. */
export function parseIntegrationState(payload: unknown): RingIntegrationState {
  if (!isRecord(payload)) return { status: 'unknown', raw: payload };
  const data = isRecord(payload.data) ? payload.data : undefined;
  const attributes = data && isRecord(data.attributes) ? data.attributes : undefined;
  const status = attributes?.status ?? payload.status;
  return {
    status: typeof status === 'string' ? status : 'unknown',
    raw: payload,
  };
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class RingClient {
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RingClientOptions) {
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
    this.sleep = options.sleep ?? defaultSleep;
  }

  private get apiBaseUrl(): string {
    return (this.options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  }

  private get oauthBaseUrl(): string {
    return (this.options.oauthBaseUrl ?? DEFAULT_OAUTH_BASE_URL).replace(/\/+$/, '');
  }

  /** Exchange the one-time authorization code (valid 60 s) for tokens. */
  async exchangeAuthorizationCode(input: { code: string; redirectUri?: string }): Promise<RingTokenSet> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code: input.code,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
      ...(input.redirectUri ? { redirect_uri: input.redirectUri } : {}),
    });
  }

  /**
   * Refresh before expiry (~30-day refresh token). A dead refresh token means
   * the user must re-link; the caller surfaces that instead of a 500.
   */
  async refreshAccessToken(refreshToken: string): Promise<RingTokenSet> {
    return this.tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret,
    });
  }

  /** The Ring Account ID - the only trustworthy source for nonce matching. */
  async getUsersMe(accessToken: string): Promise<RingUserProfile> {
    const body = await this.authorizedRequest(accessToken, 'GET', `${this.apiBaseUrl}/v1/users/me`);
    const data = isRecord(body) && isRecord(body.data) ? body.data : {};
    const accountId = typeof data.id === 'string' ? data.id : '';
    if (!accountId) {
      throw new RingApiError('GET /v1/users/me returned no account id', 200, null, null, body);
    }
    const attributes = isRecord(data.attributes) ? data.attributes : {};
    // Docs return first_name + last_name; some payloads carry a single `name`.
    const fullName = [attributes.first_name, attributes.last_name]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(' ');
    return {
      accountId,
      name: fullName || (typeof attributes.name === 'string' ? attributes.name : null),
      email: typeof attributes.email === 'string' ? attributes.email : null,
    };
  }

  /** Device discovery. Returns normalised devices; nothing is persisted here. */
  async listDevices(accessToken: string, options: { include?: string } = {}): Promise<RingDevice[]> {
    const include = options.include ?? DEVICE_INCLUDE;
    const url = `${this.apiBaseUrl}/v1/devices?include=${encodeURIComponent(include)}`;
    const body = await this.authorizedRequest(accessToken, 'GET', url);
    return parseRingDevices(body);
  }

  /**
   * Step 1 of the two-step claim: `POST` the integration into `awaiting`.
   *
   * Sent as a flat JSON body (`account_identifier`, `nonce`) as the docs
   * describe; whether Ring wraps it in a JSON:API envelope is unverified
   * while we have no live account (friction log).
   */
  async createIntegration(
    accessToken: string,
    input: { accountIdentifier: string; nonce: string },
  ): Promise<RingIntegrationState> {
    const body = await this.authorizedRequest(
      accessToken,
      'POST',
      `${this.apiBaseUrl}/v1/accounts/me/app-integrations`,
      { account_identifier: input.accountIdentifier, nonce: input.nonce },
    );
    return parseIntegrationState(body);
  }

  /** Step 2 of the claim - the docs call this PATCH mandatory. */
  async completeIntegration(accessToken: string): Promise<RingIntegrationState> {
    const body = await this.authorizedRequest(
      accessToken,
      'PATCH',
      `${this.apiBaseUrl}/v1/accounts/me/app-integrations`,
      { status: 'completed' },
    );
    return parseIntegrationState(body);
  }

  /** Unlink. Ring's integration is marked removed; the caller deletes tokens. */
  async deleteIntegration(accessToken: string): Promise<void> {
    await this.authorizedRequest(
      accessToken,
      'DELETE',
      `${this.apiBaseUrl}/v1/accounts/me/app-integrations`,
    );
  }

  private async tokenRequest(fields: Record<string, string>): Promise<RingTokenSet> {
    const response = await this.withRetry(() =>
      this.fetchImpl(`${this.oauthBaseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields).toString(),
      }),
    );
    const body = await this.readJson(response);
    const record = isRecord(body) ? body : {};
    const accessToken = record.access_token;
    if (typeof accessToken !== 'string' || accessToken === '') {
      throw new RingApiError(
        'Token response contained no access_token',
        response.status,
        null,
        null,
        body,
      );
    }
    return {
      accessToken,
      refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : null,
      expiresInSeconds: typeof record.expires_in === 'number' ? record.expires_in : 0,
      scope: typeof record.scope === 'string' ? record.scope : null,
      tokenType: typeof record.token_type === 'string' ? record.token_type : 'Bearer',
    };
  }

  private async authorizedRequest(
    accessToken: string,
    method: string,
    url: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.withRetry(() =>
      this.fetchImpl(url, {
        method,
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return this.readJson(response);
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const first = parseJsonApiErrors(parsed)[0];
      const suffix = first?.detail
        ? ` - ${first.detail}`
        : !first && text
          ? ` - ${text.slice(0, 200)}`
          : '';
      throw new RingApiError(
        `Ring API ${response.status}${first?.title ? `: ${first.title}` : ''}${suffix}`,
        response.status,
        first?.title ?? null,
        first?.detail ?? null,
        parsed,
      );
    }
    return parsed;
  }

  /**
   * Retry policy: 429 honours `Retry-After`; 5xx and transport errors use
   * exponential backoff. Everything else is returned as-is.
   */
  private async withRetry(run: () => Promise<Response>): Promise<Response> {
    const maxAttempts = this.maxRetries + 1;
    let lastTransportError: unknown = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await run();
      } catch (error) {
        lastTransportError = error;
        if (attempt < maxAttempts - 1) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        throw new RingApiError(
          `Ring API unreachable: ${error instanceof Error ? error.message : String(error)}`,
          0,
          null,
          null,
          null,
        );
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < maxAttempts - 1) {
        const retryAfterMs =
          response.status === 429 ? parseRetryAfter(response.headers.get('retry-after')) : null;
        const delay = Math.min(retryAfterMs ?? this.backoffMs(attempt), this.maxRetryDelayMs);
        await this.sleep(Math.max(0, delay));
        continue;
      }
      return response;
    }

    // Unreachable: the loop either returns or throws.
    throw new RingApiError('Ring API unreachable', 0, null, null, lastTransportError);
  }

  private backoffMs(attempt: number): number {
    return this.retryBaseMs * 2 ** attempt;
  }
}
