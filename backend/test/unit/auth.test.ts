import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { hashPassword, verifyPassword } from '../../src/modules/auth/password';
import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/token';
import { env } from '../../src/config/env';

describe('passwords', () => {
  it('hashes with a fresh salt and verifies only the right password', async () => {
    const [one, two] = await Promise.all([
      hashPassword('Correct horse 1'),
      hashPassword('Correct horse 1'),
    ]);
    expect(one).toMatch(/^scrypt\$32768\$8\$3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(one).not.toBe(two);
    expect(await verifyPassword('Correct horse 1', one)).toBe(true);
    expect(await verifyPassword('correct horse 1', one)).toBe(false);
    expect(await verifyPassword('', one)).toBe(false);
  });

  it('treats a malformed stored hash as a failed check, not a crash', async () => {
    for (const stored of [
      '',
      'plain',
      'bcrypt$x$y',
      'scrypt$1$2$3$$',
      'scrypt$32768$8$3$c2FsdA==',
    ]) {
      expect(await verifyPassword('anything', stored)).toBe(false);
    }
  });
});

describe('access tokens', () => {
  const sign = (payload: object, options: jwt.SignOptions, secret = env.JWT_SECRET) =>
    jwt.sign(payload, secret, { issuer: 'outlet-hq-api', audience: 'outlet-hq', ...options });

  it('round-trips the user id', () => {
    const { token, expiresIn } = signAccessToken('user-1');
    expect(expiresIn).toBe(env.JWT_EXPIRES_IN);
    expect(verifyAccessToken(token)).toBe('user-1');
  });

  it.each([
    ['another secret', () => sign({ sub: 'u' }, {}, 'another-secret-that-is-long-enough-12345')],
    ['an expired token', () => sign({ sub: 'u' }, { expiresIn: -10 })],
    ['the wrong audience', () => sign({ sub: 'u' }, { audience: 'someone-else' })],
    ['the wrong issuer', () => sign({ sub: 'u' }, { issuer: 'someone-else' })],
    ['no subject', () => sign({}, {})],
    [
      'alg none',
      () =>
        jwt.sign({ sub: 'u' }, '', {
          algorithm: 'none',
          issuer: 'outlet-hq-api',
          audience: 'outlet-hq',
        }),
    ],
    ['garbage', () => 'not.a.token'],
  ])('refuses %s with INVALID_TOKEN', (_name, make) => {
    expect(() => verifyAccessToken(make())).toThrow(
      expect.objectContaining({ status: 401, code: 'INVALID_TOKEN' }),
    );
  });
});
