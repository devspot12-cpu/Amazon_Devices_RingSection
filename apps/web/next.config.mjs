import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

// Runtime configuration lives once, at the repository root (`.env.local`).
const appDir = path.dirname(fileURLToPath(import.meta.url));

nextEnv.loadEnvConfig(path.resolve(appDir, '../..'));

const nextConfig = {
  transpilePackages: ['@predator-guard/db', '@predator-guard/ring', '@predator-guard/rules', '@predator-guard/vision'],
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  experimental: {
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
};

export default nextConfig;
