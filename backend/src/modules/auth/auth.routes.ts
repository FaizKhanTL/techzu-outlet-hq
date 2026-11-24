import { Router } from 'express';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { RateLimitedError } from '../../lib/rate-limit';
import { loginSchemas } from './auth.schemas';
import * as controller from './auth.controller';

/** Per-instance counts; with several API instances, use a shared store (see docs/ARCHITECTURE.md). */
export const loginRateLimitStore = new MemoryStore();

// Ten tries a minute per address (the default) slows password guessing without bothering a real person.
const loginLimiter = rateLimit({
  store: loginRateLimitStore,
  windowMs: 60_000,
  limit: env.LOGIN_RATE_LIMIT_PER_MINUTE,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new RateLimitedError()),
});

export const authRouter = Router();
authRouter.post('/login', loginLimiter, validate(loginSchemas), controller.login);
authRouter.get('/me', authenticate, controller.me);
