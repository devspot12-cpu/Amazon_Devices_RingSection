import { DEFAULT_API_BASE_URL, DEFAULT_OAUTH_BASE_URL } from '@predator-guard/ring';

/**
 * Environment loading (FEATURES.md cross-cutting: "All credentials and model
 * ids from env, validated at boot with zod; missing config fails fast").
 *
 * One rule shapes everything here: **sim vs real Ring is a configuration
 * switch, never a code fork** (PLAN.md design rule 3). When no Ring
 * credentials are present in development we fill in simulator defaults -
 * credentials, HMAC key, token key and base URLs - so `npm run dev` works with
 * zero setup. In production, or when credentials (or `RING_ACCESS_TOKEN`) are
 * set, the real values are required and a missing one throws with the exact
 * variable name.
 */

/** Truthy spellings accepted for `RING_SIM`. */
const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/**
 * Where the simulator mounts inside the web app (see `app/api/sim`).
 * The dev server listens on this origin; `npm run dev` pins port 3000.
 */
export const SIM_ORIGIN = 'http://localhost:3000';

/** Simulator-only credentials. They authenticate nothing outside the fake API. */
export const SIM_DEFAULTS = {
  clientId: 'sim-client-id',
  clientSecret: 'sim-client-secret',
  hmacKey: 'sim-hmac-key',
  /**
   * 32 bytes as 64 hex characters. Published on purpose so the zero-config
   * demo can seal tokens; sim mode never holds a real Ring token.
   */
  tokenEncKey: 'deadbeef'.repeat(8),
  apiBaseUrl: `${SIM_ORIGIN}/api/sim`,
  oauthBaseUrl: `${SIM_ORIGIN}/api/sim`,
} as const;

export interface RingConfig {
  /** True when Ring traffic should hit the fake API. */
  isSim: boolean;
  /** Postgres URL; when absent the embedded PGlite database is used. */
  databaseUrl: string | undefined;
  /** PGlite data directory; a path persists across restarts. */
  pgliteDataDir: string;
  /** AES-256-GCM key material (the token vault parses it). */
  tokenEncKey: string;
  clientId: string;
  clientSecret: string;
  /** One key, two encodings: webhook signatures (hex) and link nonces (base64url). */
  hmacKey: string;
  apiBaseUrl: string;
  oauthBaseUrl: string;
  /**
   * A Ring access token pasted into the environment (`RING_ACCESS_TOKEN`).
   * When set, Ring calls use this one token: no account-linking step, no token
   * vault row and no refresh - re-paste a fresh token when it expires.
   */
  ringAccessToken: string | undefined;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/**
 * Resolve the app configuration. Pure and injectable so tests can exercise
 * both the sim and the real branch without touching `process.env`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RingConfig {
  const get = (name: string): string | undefined => readEnv(env, name);

  const explicitSim = TRUTHY.has((get('RING_SIM') ?? '').toLowerCase());
  const ringAccessToken = get('RING_ACCESS_TOKEN');
  const ringConfigured = Boolean(
    get('RING_CLIENT_ID') && get('RING_CLIENT_SECRET') && get('RING_HMAC_KEY'),
  );
  const isProduction = env.NODE_ENV === 'production';
  // A pasted access token is real-Ring configuration on its own (RING_SIM still wins).
  const isSim = explicitSim || (!isProduction && !ringConfigured && !ringAccessToken);

  const missing: string[] = [];
  /** In sim mode a variable may fall back to its simulator default. */
  const resolve = (name: string, simDefault: string, needed = true): string => {
    const value = get(name);
    if (value) return value;
    // A credential this run never uses (the static token replaces the OAuth
    // trio, and nothing is sealed without the vault) must not block startup.
    if (!needed) return '';
    if (isSim) return simDefault;
    missing.push(name);
    return '';
  };

  const config: RingConfig = {
    isSim,
    databaseUrl: get('DATABASE_URL'),
    pgliteDataDir: get('PGLITE_DATA_DIR') ?? '.pglite',
    tokenEncKey: resolve('TOKEN_ENC_KEY', SIM_DEFAULTS.tokenEncKey, !ringAccessToken),
    clientId: resolve('RING_CLIENT_ID', SIM_DEFAULTS.clientId, !ringAccessToken),
    clientSecret: resolve('RING_CLIENT_SECRET', SIM_DEFAULTS.clientSecret, !ringAccessToken),
    // Webhooks are verified with this key whenever it is set; the route refuses
    // to run without it (see `handleWebhookRequest`).
    hmacKey: resolve('RING_HMAC_KEY', SIM_DEFAULTS.hmacKey, !ringAccessToken),
    apiBaseUrl: get('RING_API_BASE_URL') ?? (isSim ? SIM_DEFAULTS.apiBaseUrl : DEFAULT_API_BASE_URL),
    oauthBaseUrl:
      get('RING_OAUTH_BASE_URL') ?? (isSim ? SIM_DEFAULTS.oauthBaseUrl : DEFAULT_OAUTH_BASE_URL),
    ringAccessToken,
  };

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment ${missing.map((name) => `"${name}"`).join(', ')}. ` +
        'For the zero-config simulator set RING_SIM=1 (development only).',
    );
  }
  return config;
}
