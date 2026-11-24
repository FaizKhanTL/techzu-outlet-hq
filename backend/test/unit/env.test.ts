import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env';

const minimal = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults to a minimal configuration', () => {
    expect(parseEnv(minimal)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      CURRENCY: 'MYR',
      JWT_EXPIRES_IN: '8h',
      CORS_ORIGINS: [],
      RUN_MIGRATIONS: false,
      SEED_DEMO_DATA: false,
      TRUST_PROXY_HOPS: 1,
    });
  });

  it('reads numbers, booleans and the origin list from strings', () => {
    const env = parseEnv({
      ...minimal,
      PORT: '8080',
      RUN_MIGRATIONS: '1',
      SEED_DEMO_DATA: 'true',
      CORS_ORIGINS: ' http://a.test, ,http://b.test ',
    });
    expect(env).toMatchObject({ PORT: 8080, RUN_MIGRATIONS: true, SEED_DEMO_DATA: true });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('lists every problem in one error', () => {
    let message = '';
    try {
      parseEnv({
        JWT_SECRET: 'short',
        CURRENCY: 'ringgit',
        PORT: '70000',
        JWT_EXPIRES_IN: 'forever',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^Invalid environment configuration:/);
    for (const problem of [
      'DATABASE_URL',
      'JWT_SECRET: JWT_SECRET must be at least 32 characters',
      'CURRENCY',
      'PORT',
      'JWT_EXPIRES_IN',
    ]) {
      expect(message).toContain(problem);
    }
  });

  it('refuses a boolean that is not one', () => {
    expect(() => parseEnv({ ...minimal, RUN_MIGRATIONS: 'yes' })).toThrow(/RUN_MIGRATIONS/);
  });
});
