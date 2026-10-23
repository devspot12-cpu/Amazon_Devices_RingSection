import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

// Runtime configuration lives once, at the repository root (`.env.local`).
const appDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(appDir, '../..');

nextEnv.loadEnvConfig(rootDir);

/**
 * Route-handler workers hand-pick environment entries, so env values loaded
 * from the root `.env.local` are passed explicitly here: the config phase
 * runs in the process where `loadEnvConfig` (or `next-runner.mjs`) already
 * applied them, and Next ships the snapshot into every worker.
 *
 * Server-only keys only; anything `NEXT_PUBLIC_` would be bundled to the
 * browser and none of these belong there. Restart `npm run dev` after
 * editing `.env.local` - a fresh token paste included.
 */
const SERVER_ENV_KEYS = [
  'DATABASE_URL',
  'PGLITE_DATA_DIR',
  'OPENROUTER_API_KEY',
  'OPENROUTER_VISION_MODEL',
  'OPENROUTER_BASE_URL',
  'RING_MCP_URL',
  'RING_ACCESS_TOKEN',
  'RING_API_BASE',
  'AWS_ENDPOINT_URL_S3',
  'AWS_ENDPOINT_URL',
  'AWS_REGION',
  'AWS_S3_BUCKET',
  'AWS_S3_FORCE_PATH_STYLE',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
];

const nextConfig = {
  env: Object.fromEntries(
    SERVER_ENV_KEYS.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  ),
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/rules', '@predator-guard/vision'],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  experimental: {
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
};

export default nextConfig;
