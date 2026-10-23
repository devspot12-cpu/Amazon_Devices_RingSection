import { loadConfig } from './config';

/**
 * Server-side client for the Ring Partner API, used by the live dashboard
 * section: device list, WHEP live view, event history and image snapshots.
 *
 * Everything here requires `RING_ACCESS_TOKEN` in the root `.env.local`
 * (the OAuth token from the Dev Portal). Tokens are ~4h lived; when it
 * expires the routes answer 401 `ring_token_rejected` and the section asks
 * for a fresh paste - nothing is cached or invented in between.
 *
 * Server-side only, same as the docs gateway: Ring blocks browser-origin
 * calls, and a bearer token must never reach the client.
 */

const DEFAULT_API_BASE = 'https://api.amazonvision.com';
const CALL_TIMEOUT_MS = 30_000;

export interface RingApiFailure extends Error {
  status: number;
  code: string;
}

/** One failed Ring call - mapped to a sentence a visitor can act on. */
function ringApiFailure(status: number, body: unknown): RingApiFailure {
  const errors = (body as { errors?: Array<{ title?: string; detail?: string }> })?.errors;
  const detail = errors?.[0]?.detail ?? errors?.[0]?.title;
  const code =
    status === 401
      ? 'ring_token_rejected'
      : status === 416
        ? 'media_not_found'
        : status === 429
          ? 'rate_limited'
          : 'ring_api_error';
  const friendly: Record<number, string> = {
    401: 'The Ring access token has expired or was rejected. Add a fresh RING_ACCESS_TOKEN and restart the app to reconnect.',
    403: 'Ring refused this request for this account.',
    416: 'No frame is available from this camera at that time yet.',
    429: 'Ring is rate-limiting requests. Wait a moment and try again.',
  };
  const failure = new Error(
    friendly[status] ?? detail ?? `The live view request failed (HTTP ${status}).`,
  ) as RingApiFailure;
  failure.status = status;
  failure.code = code;
  return failure;
}

async function ringFetch(
  path: string,
  init: {
    method?: string;
    body?: string;
    contentType?: string;
    accept?: string;
  } = {},
): Promise<Response> {
  const config = loadConfig();
  const token = config.ringAccessToken;
  if (!token) {
    const failure = new Error('Live cameras are not connected on this deployment.') as RingApiFailure;
    failure.status = 503;
    failure.code = 'ring_not_configured';
    throw failure;
  }
  const base = config.ringApiBaseUrl ?? DEFAULT_API_BASE;
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: init.accept ?? 'application/json',
      ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
    },
    body: init.body, // string-minded: JSON bodies and SDP offers only
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  return response;
}

async function ringJson(path: string): Promise<unknown> {
  const response = await ringFetch(path);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw ringApiFailure(response.status, body);
  return body;
}

// ---------------------------------------------------------------------------
// Shared error mapping for the /api/ring-live* routes
// ---------------------------------------------------------------------------

interface RingErrorBody {
  error: string;
  detail?: string;
}

/**
 * One error shape for every Ring-device call downstream. 401 always means
 * "the pasted token is expired or wrong" - the section asks for a fresh one.
 */
export function ringErrorResponse(err: unknown): Response {
  const failure = err as RingApiFailure;
  if (failure && typeof failure === 'object' && typeof failure.status === 'number') {
    const body: RingErrorBody = { error: failure.code ?? 'ring_api_error', detail: failure.message };
    console.error(JSON.stringify({ stage: 'ring-live.error', code: failure.code, detail: failure.message }));
    return Response.json(body, { status: failure.status });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ stage: 'ring-live.error', error: message }));
  const detail =
    process.env.NODE_ENV === 'production'
      ? 'The live view hit an unexpected error. Try again in a moment.'
      : message;
  return Response.json({ error: 'internal_error', detail }, { status: 500 });
}

export function ringLiveConfigured(): boolean {
  return Boolean(loadConfig().ringAccessToken);
}

// ---------------------------------------------------------------------------
// Status + devices
// ---------------------------------------------------------------------------

export interface RingDeviceInfo {
  id: string;
  name: string;
  /** Undefined when the include lookup failed - shown as "unknown". */
  online: boolean | undefined;
}

export interface RingLiveStatus {
  user: { email: string | undefined } | undefined;
  devices: RingDeviceInfo[];
}

/**
 * The two calls the linking flow also relies on: identity must come from
 * /v1/users/me server-side and the device list carries status includes.
 */
export async function ringLiveStatus(): Promise<RingLiveStatus> {
  const me = (await ringJson('/v1/users/me')) as { data?: { attributes?: { email?: string } } };
  const listed = (await ringJson('/v1/devices?include=status')) as {
    data?: Array<{
      id?: string;
      attributes?: { name?: string };
      relationships?: { status?: { data?: { id?: string } } };
    }>;
    included?: Array<{ id?: string; attributes?: { online?: boolean } }>;
  };
  // The include vocabulary is inverted (see docs/ring-api-notes.md): status
  // blocks surface as `included` entries keyed by resource id, wired through
  // relationships - never guess by matching the device id alone.
  const statusById = new Map(
    (listed.included ?? []).map((block) => [block.id, block.attributes?.online]),
  );
  return {
    user: { email: me.data?.attributes?.email },
    devices: (listed.data ?? [])
      .filter((entry): entry is typeof entry & { id: string } => Boolean(entry.id))
      .map((entry) => ({
        id: entry.id,
        name: entry.attributes?.name ?? entry.id,
        online: statusById.get(entry.relationships?.status?.data?.id ?? ''),
      })),
  };
}

// ---------------------------------------------------------------------------
// Event history
// ---------------------------------------------------------------------------

export interface RingEventInfo {
  /** Epoch ms of the event - snapshot-friendly via at_timestamp. */
  startMs: number;
  endMs: number | undefined;
  eventType: string | undefined;
  thirdPartyReviewed: boolean | undefined;
  /** Kept so the UI can dedupe hook cycles across restarts. */
  eventId: string | undefined;
}

export async function listRingEvents(deviceId: string, limit = 20): Promise<RingEventInfo[]> {
  const listed = (await ringJson(`/v1/history/devices/${encodeURIComponent(deviceId)}/events`)) as {
    data?: Array<{
      id?: string;
      attributes?: {
        start?: number;
        end?: number;
        event_type?: string;
        is_third_party_reviewed?: boolean;
      };
    }>;
  };
  return (listed.data ?? [])
    .slice(0, limit)
    .map((entry) => ({
      eventId: entry.id,
      startMs: entry.attributes?.start ?? 0,
      endMs: entry.attributes?.end,
      eventType: entry.attributes?.event_type,
      thirdPartyReviewed: entry.attributes?.is_third_party_reviewed,
    }))
    .filter((event) => event.startMs > 0)
    .sort((a, b) => b.startMs - a.startMs);
}

// ---------------------------------------------------------------------------
// Image snapshots (the 2-step 303 dance)
// ---------------------------------------------------------------------------

export interface RingSnapshot {
  bytes: Uint8Array;
  contentType: 'image/jpeg';
  /** X-Media-Timestamp of the frame actually returned (epoch ms). */
  mediaTimestampMs: number | undefined;
}

/**
 * One frame of a device. With a timestamp it asks for `at_timestamp`; given
 * only the device id it takes `latest_in_range` (last 10 min). `at_timestamp
 * = now` answers 416 (no frame yet), so in that case the range fallback gets
 * the newest delivered frame instead of failing (friction log row 27).
 */
export async function fetchRingSnapshot(deviceId: string, timestampMs?: number): Promise<RingSnapshot> {
  const id = encodeURIComponent(deviceId);
  const imageOptions = { format: 'jpeg', resolution: { width: 1280, height: 720 } };

  const attempt = async (payload: Record<string, unknown>): Promise<Response> => {
    const first = await ringFetch(`/v1/devices/${id}/media/image/download`, {
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify(payload),
      accept: 'application/json',
    });
    if (!first.ok) throw ringApiFailure(first.status, await first.json().catch(() => null));
    if (first.status === 200 && first.headers.get('x-media-origin')) {
      // Some deployments answer with the bytes directly - honor that too.
      return first;
    }
    // Step 2: follow the presigned Location ourselves (credentials stay
    // server-side; some presigned hosts dislike being handed the JWT).
    const location = first.headers.get('location');
    if (!location) throw ringApiFailure(500, null);
    const second = await fetch(location, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    return second;
  };

  let response: Response;
  if (timestampMs && timestampMs > 0) {
    response = await attempt({
      type: 'at_timestamp',
      timestamp: timestampMs,
      image_options: imageOptions,
    });
    if (!response.ok) {
      response = await attempt({
        type: 'latest_in_range',
        start_timestamp: timestampMs - 60_000,
        end_timestamp: timestampMs + 60_000,
        image_options: imageOptions,
      });
    }
  } else {
    response = await attempt({
      type: 'latest_in_range',
      start_timestamp: Date.now() - 10 * 60_000,
      image_options: imageOptions,
    });
  }
  if (!response.ok) throw ringApiFailure(response.status, await response.json().catch(() => null));

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mediaHeader = response.headers.get('x-media-timestamp');
  const mediaTimestampMs = mediaHeader && /^\d+$/.test(mediaHeader) ? Number(mediaHeader) : undefined;
  return { bytes, contentType: 'image/jpeg', mediaTimestampMs };
}

// ---------------------------------------------------------------------------
// WHEP live sessions (server-relayed signaling)
// ---------------------------------------------------------------------------

export function ringWhepConfigured(): boolean {
  return ringLiveConfigured();
}

export interface RingWhepSession {
  /** The SDP answer from Ring - setRemoteDescription with this. */
  answer: string;
  /** The session path tail, needed for DELETE. */
  sessionId: string | undefined;
}

/**
 * POST of one SDP offer to Ring's WHEP endpoint. `201` carries the answer in
 * the body and the session in the Location header. The browser gathered all
 * ICE candidates already (non-trickle), which is what the docs' flow expects.
 */
export async function createRingWhepSession(deviceId: string, sdpOffer: string): Promise<RingWhepSession> {
  const id = encodeURIComponent(deviceId);
  const response = await ringFetch(`/v1/devices/${id}/media/streaming/whep/sessions`, {
    method: 'POST',
    contentType: 'application/sdp',
    body: sdpOffer,
    accept: 'application/sdp',
  });
  if (!response.ok) {
    throw ringApiFailure(response.status, await response.json().catch(() => null));
  }
  const answer = await response.text();
  const location = response.headers.get('location') ?? '';
  const sessionId = location.split('/').filter(Boolean).at(-1);
  return { answer, sessionId };
}

export async function deleteRingWhepSession(deviceId: string, sessionId: string): Promise<void> {
  const id = encodeURIComponent(deviceId);
  const response = await ringFetch(
    `/v1/devices/${id}/media/streaming/whep/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  // Actually closed; Ring treats 2xx both as success - anything else logs.
  if (!response.ok && response.status !== 404) {
    throw ringApiFailure(response.status, await response.json().catch(() => null));
  }
}
