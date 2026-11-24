import { pool } from '../../db/pool';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../lib/errors';
import { findUserByEmail, findUserById, type UserRecord } from './auth.repository';
import { DUMMY_HASH_PROMISE, verifyPassword } from './password';
import { signAccessToken, verifyAccessToken } from './token';
import type { AuthContext } from './auth.types';

const INVALID_CREDENTIALS = new UnauthorizedError(
  'Email or password is incorrect.',
  'INVALID_CREDENTIALS',
);

/** A user can sign in, and keep using a token, only while they and their outlet are active. */
const canUse = (user: UserRecord) =>
  user.isActive && (user.role === 'HQ_ADMIN' || user.outletIsActive === true);

export const publicUser = (user: UserRecord) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  outletId: user.outletId,
  // The deployment's currency, so a client formats every *_cents value without its own setting.
  currency: env.CURRENCY,
});

export async function login(email: string, password: string) {
  const user = await findUserByEmail(pool, email);
  // Always run one hash comparison, so an unknown email takes as long as a wrong password.
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH_PROMISE));
  if (!user || !ok || !canUse(user)) throw INVALID_CREDENTIALS;
  return { ...signAccessToken(user.id), tokenType: 'Bearer' as const, user: publicUser(user) };
}

/** The caller behind a bearer token, read fresh so a deactivated user or outlet is refused at once. */
export async function authenticateToken(token: string): Promise<AuthContext> {
  const user = await findUserById(pool, verifyAccessToken(token));
  if (!user || !canUse(user)) {
    throw new UnauthorizedError('This account can no longer sign in.', 'ACCOUNT_DISABLED');
  }
  return { userId: user.id, email: user.email, role: user.role, outletId: user.outletId };
}

export async function getProfile(userId: string) {
  const user = await findUserById(pool, userId);
  if (!user) throw new UnauthorizedError();
  return publicUser(user);
}
