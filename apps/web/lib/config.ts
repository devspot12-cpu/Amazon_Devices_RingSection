/**
 * Environment loading for the demo.
 *
 * Only two concerns read from env: where the database lives, and which
 * vision model identifies the animal (OpenRouter). Everything Ring-specific
 * (OAuth, webhooks, HMAC, token vault, simulator flags) left the codebase
 * with the webhook pipeline.
 */

export interface AppConfig {
  /** Postgres connection string; when absent the embedded PGlite database is used. */
  databaseUrl: string | undefined;
  /** PGlite data directory; a path persists across restarts. */
  pgliteDataDir: string;
  /** OpenRouter key - the classifier for the demo. */
  openRouterApiKey: string | undefined;
  openRouterModel: string | undefined;
  openRouterBaseUrl: string | undefined;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

/** Resolve the app configuration. Injectable so callers can pass a custom env. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databaseUrl: readEnv(env, 'DATABASE_URL'),
    pgliteDataDir: readEnv(env, 'PGLITE_DATA_DIR') ?? '.pglite',
    openRouterApiKey: readEnv(env, 'OPENROUTER_API_KEY'),
    openRouterModel: readEnv(env, 'OPENROUTER_VISION_MODEL'),
    openRouterBaseUrl: readEnv(env, 'OPENROUTER_BASE_URL'),
  };
}
