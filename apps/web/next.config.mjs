/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are TypeScript sources with no separate build step; let
  // Next compile them (db, ring and sim all ship `.ts` through their exports).
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/sim'],
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
