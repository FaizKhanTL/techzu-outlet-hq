import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { authenticateToken } from '../modules/auth/auth.service';
import type { Role } from '../modules/auth/auth.types';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  const match = header?.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  if (!match?.[1]) {
    throw new UnauthorizedError(
      'Send an access token as "Authorization: Bearer <token>".',
      'TOKEN_REQUIRED',
    );
  }
  req.auth = await authenticateToken(match[1]);
  next();
};

export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (!roles.includes(req.auth.role))
      throw new ForbiddenError('Your role cannot do this.', 'ROLE_FORBIDDEN');
    next();
  };
}

/**
 * HQ may act on any outlet; outlet staff only on their own. Reads the outlet id from the route parameter, so the
 * check cannot be skipped by a UI.
 */
export function requireOutletAccess(param = 'outletId'): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw new UnauthorizedError();
    if (req.auth.role === 'HQ_ADMIN') return next();
    if (req.params[param] !== req.auth.outletId) {
      throw new ForbiddenError('You can only access your own outlet.', 'OUTLET_FORBIDDEN');
    }
    next();
  };
}
