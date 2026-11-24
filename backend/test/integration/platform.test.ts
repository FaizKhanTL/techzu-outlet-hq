import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { api, auth, createUser, resetDatabase } from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('platform', () => {
  it('answers liveness and readiness', async () => {
    expect((await api().get('/health')).body).toEqual({ status: 'ok' });
    expect((await api().get('/ready')).body).toEqual({ status: 'ready' });
  });

  it('formats an unknown route as a 404 error with the request id', async () => {
    const hq = await createUser('HQ_ADMIN');
    const res = await api()
      .get('/api/v1/nope')
      .set(auth(hq.token))
      .set('X-Request-Id', 'trace-abc-123');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    expect(res.body).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: 'Route GET /api/v1/nope was not found.',
        requestId: 'trace-abc-123',
      },
    });
  });

  it('rejects a malformed request id and makes its own', async () => {
    const res = await api().get('/health').set('X-Request-Id', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers invalid JSON and an oversized body with 400 and 413', async () => {
    const bad = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');

    const big = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api().get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
