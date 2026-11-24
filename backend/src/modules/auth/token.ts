import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../lib/errors';

const ISSUER = 'outlet-hq-api';
const AUDIENCE = 'outlet-hq';

export function signAccessToken(userId: string): { token: string; expiresIn: string } {
  const token = jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
  return { token, expiresIn: env.JWT_EXPIRES_IN };
}

/** The user id in a valid token; throws 401 for anything else (bad signature, expired, other algorithm). */
export function verifyAccessToken(token: string): string {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string')
      throw new Error('no subject');
    return payload.sub;
  } catch {
    throw new UnauthorizedError('The access token is invalid or has expired.', 'INVALID_TOKEN');
  }
}
