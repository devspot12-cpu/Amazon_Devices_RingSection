/**
 * The typed Ring Partner API client (FEATURES.md F1-F4 + Event History).
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

/** Ring speaks JSON:API; some deployments reject a bare `application/json` accept. */
export const JSONAPI_ACCEPT = 'application/vnd.api+json, application/json';
/** History paging cap - `links.next` alone is never trusted (shopsense notes). */
export const DEFAULT_MAX_HISTORY_PAGES = 10;
/** Full resolution keeps Ring's watermark small relative to the subject (friction log row 6). */
export const DEFAULT_SNAPSHOT_RESOLUTION = { width: 1280, height: 720 } as const;

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

/** One Event History row (`GET /v1/history/devices/{id}/events`). */
export interface RingHistoryEvent {
  eventId: string;
  ringDeviceId: string;
  eventType: string;
  /** `motion.animal` and friends exist only here, never on webhooks (friction log row 2). */
  subType: string | null;
  /** Epoch ms, normalised from seconds, milliseconds or ISO-8601. `0` when unreadable. */
  startMs: number;
  endMs: number | null;
  raw: unknown;
}

export interface ListHistoryOptions {
  /** Stop paging once an event at or before this epoch-ms cursor is seen. */
  sinceMs?: number;
  /** Composite filter passed as `event_types`, e.g. `['motion.animal']`. */
  eventTypes?: string[];
  /** Hard page cap (default 10); `links.next` is followed but never trusted alone. */
  maxPages?: number;
}

/** The image-snapshot reply: the JPEG/PNG plus Ring's audit headers. */
export interface RingSnapshot {
  bytes: Uint8Array;
  contentType: 'image/jpeg' | 'image/png';
  /** `X-Media-Timestamp`, tolerance-parsed; null when absent. */
  capturedAt: Date | null;
  /** `X-Media-Origin`: `recording` or `snapshot`, when present. */
  origin: string | null;
  /** `X-Request-ID` of the download that produced these bytes. */
  requestId: string | null;
}

export interface ImageSnapshotOptions {
  /** Bias the snapshot to this epoch-ms instant (`at_timestamp`). Default: now. */
  atMs?: number;
  /** Ask for the best frame in a window instead (`latest_in_range`, <= 24 h). */
  range?: { startMs: number; endMs?: number };
  format?: 'jpeg' | 'png';
  /** Defaults to full 1280x720 (the watermark is fixed-size; lower res covers more subject). */
  resolution?: { width: number; height: number };
  /** Multi-camera devices: exactly one component per call, as a string. */
  componentId?: string | null;
}

/** One sub-resource reply from `GET /v1/devices/{id}/{resource}`. */
export interface RingDeviceResource {
  /** Ring's own type name: `device-status`, `device-capabilities`, `locations`, `device-configurations`. */
  type: string;
  id: string | null;
  attributes: Record<string, unknown>;
  raw: unknown;
}

/** The four device sub-resources the playground exposes as their own endpoints. */
export const DEVICE_RESOURCES = ['status', 'capabilities', 'location', 'configurations'] as const;
export type RingDeviceResourceName = (typeof DEVICE_RESOURCES)[number];

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

/**
 * Normalise Ring's time encodings to epoch ms.
 *
 * Probes have shown Event History in epoch **ms** and the `X-Media-Timestamp`
 * header in epoch **seconds**, and the docs pin down neither, so accept
 * numbers (seconds or ms), numeric strings and ISO-8601. `null` when unreadable.
 */
export function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return toEpochMs(numeric);
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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
 * Type names real Ring uses in `included` for each relationship. The docs and
 * the simulator use the bare names; the live API uses `device-*` plus the
 * plural `locations` and links items only through relationship pointers
 * (friction log row 25).
 */
const INCLUDE_TYPE_ALIASES: Record<string, string[]> = {
  status: ['device-status', 'status'],
  capabilities: ['device-capabilities', 'capabilities'],
  configurations: ['device-configurations', 'configurations'],
  location: ['locations', 'location'],
};

/**
 * Normalise `GET /v1/devices` into `RingDevice[]`.
 *
 * Includes are resolved relation-first: real Ring links `included` items only
 * through `relationships.<name>.data {type,id}` - the ids are NOT the device
 * id - under type names like `device-status` and `locations`. The simulator
 * ships bare names keyed by device id, and some payloads flatten attributes;
 * all three shapes are accepted, and `raw` keeps whatever arrived so a
 * surprise is debuggable rather than lost (friction log rows 14, 25).
 *
 * Matching on type alone hands every camera the *first* camera's
 * configurations, and with them the wrong E2EE flag - which decides whether
 * media is ever fetched (F3).
 */
export function parseRingDevices(payload: unknown): RingDevice[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const included = Array.isArray(payload.included) ? payload.included.filter(isRecord) : [];

  const findIncluded = (
    type: string | null,
    id: string | null,
  ): Record<string, unknown> | undefined => {
    if (!id) return undefined;
    const item = included.find(
      (candidate) => candidate.id === id && (type === null || candidate.type === type),
    );
    return item && isRecord(item.attributes) ? item.attributes : undefined;
  };

  const resolveRelationship = (
    item: Record<string, unknown>,
    name: string,
  ): Record<string, unknown> | undefined => {
    // 1) Follow the relationship pointer (real Ring): data {type, id}.
    const relationships = isRecord(item.relationships) ? item.relationships : {};
    const relation = isRecord(relationships[name]) ? relationships[name] : undefined;
    if (relation) {
      const pointer = isRecord(relation.data) ? relation.data : undefined;
      if (pointer) {
        const found = findIncluded(
          typeof pointer.type === 'string' ? pointer.type : null,
          typeof pointer.id === 'string' ? pointer.id : null,
        );
        if (found) return found;
      }
    }
    // 2) Fall back to bare type aliases keyed by device id (simulator).
    for (const alias of INCLUDE_TYPE_ALIASES[name] ?? [name]) {
      const found = findIncluded(alias, typeof item.id === 'string' ? item.id : null);
      if (found) return found;
    }
    return undefined;
  };

  const devices: RingDevice[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) continue;
    const ringDeviceId = typeof item.id === 'string' ? item.id : '';
    if (!ringDeviceId) continue;
    const attributes = isRecord(item.attributes) ? item.attributes : {};
    const status = resolveRelationship(item, 'status') ?? {};
    const capabilities =
      resolveRelationship(item, 'capabilities') ??
      (isRecord(attributes.capabilities) ? attributes.capabilities : null);
    const configurations =
      resolveRelationship(item, 'configurations') ??
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

/**
 * Normalise `GET /v1/history/devices/{id}/events` into `RingHistoryEvent[]`.
 *
 * Malformed rows are skipped, not thrown on: history is also the playground
 * path (no webhooks can arrive there), and one bad row must not blank the page.
 */
export function parseHistoryEvents(payload: unknown): RingHistoryEvent[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];
  const events: RingHistoryEvent[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) continue;
    const eventId = typeof item.id === 'string' ? item.id : '';
    const attributes = isRecord(item.attributes) ? item.attributes : {};
    const eventType = typeof attributes.event_type === 'string' ? attributes.event_type : '';
    if (!eventId || !eventType) continue;
    const relationships = isRecord(item.relationships) ? item.relationships : {};
    const source = isRecord(relationships.source) ? relationships.source : {};
    const sourceData = isRecord(source.data) ? source.data : {};
    events.push({
      eventId,
      ringDeviceId: typeof sourceData.id === 'string' ? sourceData.id : '',
      eventType,
      subType:
        typeof attributes.sub_type === 'string' && attributes.sub_type !== ''
          ? attributes.sub_type
          : null,
      startMs: toEpochMs(attributes.start) ?? 0,
      endMs: toEpochMs(attributes.end),
      raw: item,
    });
  }
  return events;
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
   * `GET /v1/devices/{id}` - one camera ("Device Discovery" in the playground).
   * `include=` is accepted here too (verified live), so the default stays
   * `DEVICE_INCLUDE` and the reply parses through the same normaliser.
   */
  async getDevice(
    accessToken: string,
    ringDeviceId: string,
    options: { include?: string } = {},
  ): Promise<RingDevice | null> {
    const include = options.include ?? DEVICE_INCLUDE;
    const url = `${this.apiBaseUrl}/v1/devices/${encodeURIComponent(ringDeviceId)}?include=${encodeURIComponent(include)}`;
    const body = await this.authorizedRequest(accessToken, 'GET', url);
    const data = isRecord(body) && isRecord(body.data) ? body.data : null;
    if (!data) return null;
    return parseRingDevices({ data: [data], included: isRecord(body) ? body.included : undefined })[0] ?? null;
  }

  /**
   * One device sub-resource (`GET /v1/devices/{id}/{resource}`): the Status,
   * Capabilities, Locations and Configurations entries the playground exposes.
   * Attributes come back as-is - their shapes differ per deployment and only
   * the fields a caller needs are read (e.g. `online`, `reported_at`).
   */
  async getDeviceResource(
    accessToken: string,
    ringDeviceId: string,
    resource: RingDeviceResourceName,
  ): Promise<RingDeviceResource> {
    const body = await this.authorizedRequest(
      accessToken,
      'GET',
      `${this.apiBaseUrl}/v1/devices/${encodeURIComponent(ringDeviceId)}/${resource}`,
    );
    const data = isRecord(body) && isRecord(body.data) ? body.data : {};
    return {
      type: typeof data.type === 'string' ? data.type : resource,
      id: typeof data.id === 'string' ? data.id : null,
      attributes: isRecord(data.attributes) ? data.attributes : {},
      raw: body,
    };
  }

  /**
   * Event History for one device (`GET /v1/history/devices/{id}/events`).
   *
   * This is the path that works without webhooks - the playground account
   * cannot receive them - and the only place `motion.animal` exists (friction
   * log row 2). `links.next` is followed directly (it carries the active
   * filters and the page cursor); paging also stops on a `sinceMs` hit, an
   * empty page or the `maxPages` cap, because the cursor is trusted by nobody.
   */
  async listHistoryEvents(
    accessToken: string,
    ringDeviceId: string,
    options: ListHistoryOptions = {},
  ): Promise<RingHistoryEvent[]> {
    const maxPages = options.maxPages ?? DEFAULT_MAX_HISTORY_PAGES;
    const query = new URLSearchParams();
    if (options.eventTypes && options.eventTypes.length > 0) {
      query.set('event_types', options.eventTypes.join(','));
    }
    const querySuffix = query.toString() === '' ? '' : `?${query.toString()}`;
    let nextUrl: string | null =
      `${this.apiBaseUrl}/v1/history/devices/${encodeURIComponent(ringDeviceId)}/events${querySuffix}`;
    const collected: RingHistoryEvent[] = [];

    for (let page = 0; nextUrl !== null && page < maxPages; page += 1) {
      const body = await this.authorizedRequest(accessToken, 'GET', nextUrl);
      const pageEvents = parseHistoryEvents(body);
      let reachedCursor = false;
      for (const event of pageEvents) {
        if (options.sinceMs !== undefined && event.startMs > 0 && event.startMs <= options.sinceMs) {
          reachedCursor = true;
          continue;
        }
        collected.push(event);
      }
      const links = isRecord(body) && isRecord(body.links) ? body.links : {};
      const nextHref = typeof links.next === 'string' && links.next !== '' ? links.next : null;
      nextUrl =
        reachedCursor || pageEvents.length === 0 || nextHref === null
          ? null
          : nextHref.startsWith('http')
            ? nextHref
            : `${this.apiBaseUrl}${nextHref}`;
    }

    return collected.sort((a, b) => a.startMs - b.startMs);
  }

  /**
   * The image snapshot (FEATURES.md F4 primary path):
   * `POST /v1/devices/{id}/media/image/download`.
   *
   * Ring answers **303** with a pre-signed URL; `fetch` follows it by default,
   * so one call yields the bytes. `null` means "no frame right now" (403,
   * 404, 416, 425 - an event whose clip is not ready must not raise, F4
   * criterion 4); 401, 429 and 5xx still throw, because those are never the
   * camera's fault.
   */
  async fetchImageSnapshot(
    accessToken: string,
    ringDeviceId: string,
    options: ImageSnapshotOptions = {},
  ): Promise<RingSnapshot | null> {
    const imageOptions = {
      format: options.format ?? 'jpeg',
      resolution: options.resolution ?? DEFAULT_SNAPSHOT_RESOLUTION,
    };
    const body: Record<string, unknown> = options.range
      ? {
          type: 'latest_in_range',
          start_timestamp: options.range.startMs,
          ...(options.range.endMs === undefined ? {} : { end_timestamp: options.range.endMs }),
          image_options: imageOptions,
        }
      : {
          type: 'at_timestamp',
          timestamp: options.atMs ?? Date.now(),
          image_options: imageOptions,
        };
    if (options.componentId) {
      body.components = [{ component_id: String(options.componentId) }];
    }

    const response = await this.withRetry(() =>
      this.fetchImpl(
        `${this.apiBaseUrl}/v1/devices/${encodeURIComponent(ringDeviceId)}/media/image/download`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            accept: JSONAPI_ACCEPT,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      ),
    );

    if (response.status === 401 || response.status === 429 || response.status >= 500) {
      await this.readJson(response); // Always throws; keeps auth and outages visible.
    }
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const contentType = response.headers.get('content-type') ?? '';
    const capturedAtMs = toEpochMs(response.headers.get('x-media-timestamp'));
    return {
      bytes,
      contentType: contentType.includes('png') ? 'image/png' : 'image/jpeg',
      capturedAt: capturedAtMs === null ? null : new Date(capturedAtMs),
      origin: response.headers.get('x-media-origin'),
      requestId: response.headers.get('x-request-id'),
    };
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
          accept: JSONAPI_ACCEPT,
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
