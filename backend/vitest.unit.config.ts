import { defineConfig } from 'vitest/config';

// Unit tests: no database, no network, run in parallel.
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup-env.ts'],
    restoreMocks: true,
  },
});
