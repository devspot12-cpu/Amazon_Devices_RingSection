import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Workspace packages and the app are both fair game for tests.
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    passWithNoTests: true,
  },
});
