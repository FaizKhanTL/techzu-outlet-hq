import { defineConfig } from 'vitest/config';

// Integration tests: the real app against a real PostgreSQL (TEST_DATABASE_URL).
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // The files share one database, so they run one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
