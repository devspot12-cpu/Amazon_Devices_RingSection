/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Ring client is a workspace package written in TypeScript; let Next compile it
  // rather than shipping a separate build step.
  transpilePackages: ['@predator-guard/ring'],
};

export default nextConfig;
