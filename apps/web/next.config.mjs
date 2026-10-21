import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

// Runtime configuration lives once, at the repository root (`.env.local`).
// Next only reads env files from its own app directory, so load the root set
// before the app reads process.env.
const appDir = path.dirname(fileURLToPath(import.meta.url));
// @next/env is CommonJS; destructure from the default export so this file also
// loads under plain Node, not only inside Next's config loader.
nextEnv.loadEnvConfig(path.resolve(appDir, '../..'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TypeScript sources with no separate build step; let
  // Next compile them (db, ring, rules and vision all ship `.ts` through exports).
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/rules', '@predator-guard/vision'],
  // PGlite loads a WASM Postgres and postgres-js is a native client - both must
  // stay out of the server bundle and be required at runtime instead.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  experimental: {
    // The packages use ESM-style `./client.js` specifiers that actually
    // resolve to `./client.ts` (moduleResolution: bundler). Vitest and tsc
    // handle that natively; Next's webpack resolver needs the alias to do the
    // same, or every workspace import fails with "Module not found".
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
};

export default nextConfig;
