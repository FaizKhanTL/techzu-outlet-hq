// Runs before any test file imports the app, so src/config/env.ts reads these.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://outlet_hq:outlet_hq@localhost:5432/outlet_hq_test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-secret-that-is-at-least-32-characters-long';
process.env.CURRENCY = 'MYR';
process.env.DATABASE_POOL_MAX = '20';
