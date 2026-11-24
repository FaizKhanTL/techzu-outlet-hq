import type { AuthContext } from '../modules/auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      /** Set by the requestId middleware; echoed as X-Request-Id and in every error body. */
      requestId: string;
      /** Set by authenticate(). */
      auth?: AuthContext;
      /** Set by validate(): the parsed params, query and body. Read it through validated(). */
      validated?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export {};
