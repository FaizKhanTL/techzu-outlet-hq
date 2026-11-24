import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { pool } from '../src/db/pool';
import { loginRateLimitStore } from '../src/modules/auth/auth.routes';
import { api, auth, createOutlet, createUser, PASSWORD, resetDatabase } from './helpers';

beforeEach(async () => {
  await resetDatabase();
  loginRateLimitStore.resetAll();
});
afterAll(() => pool.end());

const login = (email: string, password: string) =>
  api().post('/api/v1/auth/login').send({ email, password });

describe('auth', () => {
  it('signs in with email (any case) and password, and /me returns the user', async () => {
    await createUser('HQ_ADMIN', null, 'boss@example.com');
    const res = await login('BOSS@example.com', PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      tokenType: 'Bearer',
      user: { email: 'boss@example.com', role: 'HQ_ADMIN' },
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const me = await api().get('/api/v1/auth/me').set(auth(res.body.data.token));
    expect(me.body.data).toMatchObject({
      email: 'boss@example.com',
      role: 'HQ_ADMIN',
      outletId: null,
    });
  });

  it('gives the same answer for an unknown email and a wrong password', async () => {
    await createUser('HQ_ADMIN', null, 'boss@example.com');
    const wrong = await login('boss@example.com', 'not-the-password');
    const unknown = await login('nobody@example.com', PASSWORD);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error).toMatchObject({
      code: wrong.body.error.code,
      message: wrong.body.error.message,
    });
  });

  it('refuses a deactivated user, and a token issued before deactivation', async () => {
    const user = await createUser('HQ_ADMIN', null, 'boss@example.com');
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);
    expect((await login('boss@example.com', PASSWORD)).status).toBe(401);
    const res = await api().get('/api/v1/auth/me').set(auth(user.token));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('refuses staff of a deactivated outlet', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const staff = await createUser('OUTLET_STAFF', outlet.id);
    await api().patch(`/api/v1/outlets/${outlet.id}`).set(auth(hq.token)).send({ isActive: false });
    expect((await api().get('/api/v1/auth/me').set(auth(staff.token))).status).toBe(401);
  });

  it('needs a valid bearer token on protected routes', async () => {
    const none = await api().get('/api/v1/menu-items');
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('TOKEN_REQUIRED');

    const garbage = await api()
      .get('/api/v1/menu-items')
      .set('Authorization', 'Bearer not.a.token');
    expect(garbage.body.error.code).toBe('INVALID_TOKEN');

    const user = await createUser('HQ_ADMIN');
    const forged = jwt.sign({ sub: user.id }, 'some-other-secret-that-is-long-enough-123', {
      issuer: 'outlet-hq-api',
      audience: 'outlet-hq',
    });
    expect((await api().get('/api/v1/menu-items').set(auth(forged))).body.error.code).toBe(
      'INVALID_TOKEN',
    );

    const unsigned = jwt.sign({ sub: user.id }, '', {
      algorithm: 'none',
      issuer: 'outlet-hq-api',
      audience: 'outlet-hq',
    });
    expect((await api().get('/api/v1/menu-items').set(auth(unsigned))).status).toBe(401);
  });

  it('validates the login body', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'not-an-email', extra: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['body.email', 'body.password']));
  });

  it('rate-limits repeated logins from one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await login('nobody@example.com', 'x')).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
