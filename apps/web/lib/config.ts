/**
 * Environment loading for the demo.
 *
 * Only a few concerns read from env: where the database lives, the vision
 * model that identifies the animal (OpenRouter), the Ring knowledge MCP
 * gateway override (`mcp.json` is the default) and the Ring Partner API
 * token for the live section.
 */

import path from 'node:path';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Next dev spawns server workers that hand-pick env entries next.config.mjs
 * loaded - so the root `.env.local` is re-applied here, on whatever process
 * actually runs this module. First loadConfig() call pays for one read;
 * every later one is a no-op.
 */
let rootEnvLoaded = false;

function loadRootEnvOnce(): void {
  if (rootEnvLoaded) return;
  rootEnvLoaded = true;
  if (process.env.DATABASE_URL || process.env.RING_ACCESS_TOKEN) return; // already present
  try {
    // @next/env is a devDependency: at runtime, only the dev flows need it.
    const require = createRequire(import.meta.url);
    require('@next/env').loadEnvConfig(findRootEnvDir());
  } catch (err) {
    console.warn(
      JSON.stringify({
        stage: 'config.root_env_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

function findRootEnvDir(): string {
  let dir = process.cwd();
  for (let hop = 0; hop < 4; hop += 1) {
    try {
      if (statSync(path.join(dir, '.env.local')).isFile()) return dir;
    } catch {
      // keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return dir;
}

export interface AppConfig {
  /** Postgres connection string; when absent the embedded PGlite database is used. */
  databaseUrl: string | undefined;
  /** PGlite data directory; a path persists across restarts. */
  pgliteDataDir: string;
  /** OpenRouter key - the classifier for the demo. */
  openRouterApiKey: string | undefined;
  openRouterModel: string | undefined;
  openRouterBaseUrl: string | undefined;
  /** Ring knowledge MCP gateway URL; when absent it is read from `mcp.json`. */
  ringMcpUrl: string | undefined;
  /**
   * Ring Partner API bearer token (a generated OAuth token) - powers the
   * live section: devices, live view, snapshots and the motion hook. When
   * absent, everything Ring-device-shaped stays disabled.
   */
  ringAccessToken: string | undefined;
  /** Ring API base; the documented production value by default. */
  ringApiBaseUrl: string | undefined;
}

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadRootEnvOnce();
  return {
    databaseUrl: readEnv(env, 'DATABASE_URL'),
    pgliteDataDir: readEnv(env, 'PGLITE_DATA_DIR') ?? '.pglite',
    openRouterApiKey: readEnv(env, 'OPENROUTER_API_KEY'),
    openRouterModel: readEnv(env, 'OPENROUTER_VISION_MODEL'),
    openRouterBaseUrl: readEnv(env, 'OPENROUTER_BASE_URL'),
    ringMcpUrl: readEnv(env, 'RING_MCP_URL'),
    ringAccessToken: readEnv(env, 'RING_ACCESS_TOKEN'),
    ringApiBaseUrl: readEnv(env, 'RING_API_BASE'),
  };
}
