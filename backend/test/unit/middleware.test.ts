import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { validate, validated } from '../../src/middleware/validate';
import { errorHandler, notFound } from '../../src/middleware/error-handler';
import { requestId } from '../../src/middleware/request-id';
import { authorize, requireOutletAccess } from '../../src/middleware/authenticate';
import { ConflictError } from '../../src/lib/errors';
import type { AuthContext } from '../../src/modules/auth/auth.types';

const OUTLET = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const hq: AuthContext = { userId: 'u1', email: 'hq@x.test', role: 'HQ_ADMIN', outletId: null };
const staff: AuthContext = {
  userId: 'u2',
  email: 's@x.test',
  role: 'OUTLET_STAFF',
  outletId: OUTLET,
};

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
  };
  return res;
}

const run = (
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Partial<Request>,
) => {
  const next = vi.fn();
  const res = fakeRes();
  handler(req as Request, res as unknown as Response, next);
  return { next, res, error: next.mock.calls[0]?.[0] as unknown };
};

describe('validate', () => {
  const schemas = {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({ limit: z.coerce.number().int().max(10) }),
    body: z.object({ name: z.string().min(1) }).strict(),
  };

  it('stores the parsed values (coerced) for validated()', () => {
    const req = {
      params: { id: OUTLET },
      query: { limit: '5' },
      body: { name: 'A' },
    } as unknown as Request;
    const { next } = run(validate(schemas), req);
    expect(next).toHaveBeenCalledWith();
    expect(validated(req, schemas)).toEqual({
      params: { id: OUTLET },
      query: { limit: 5 },
      body: { name: 'A' },
    });
  });

  it('reports the problems of every part at once, each path prefixed with its part', () => {
    const { error } = run(validate(schemas), {
      params: { id: 'x' },
      query: { limit: '50' },
      body: { extra: 1 },
    } as never);
    expect(error).toBeInstanceOf(ZodError);
    const paths = (error as ZodError).issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['params.id', 'query.limit', 'body.name', 'body']),
    );
  });

  it('refuses to hand out input on a route that did not validate it', () => {
    expect(() => validated({} as Request, schemas)).toThrow(/without the validate/);
  });
});

describe('errorHandler', () => {
  const format = (error: unknown) => {
    const res = fakeRes();
    errorHandler(error, { requestId: 'req-1' } as Request, res as unknown as Response, vi.fn());
    return res;
  };

  it('formats an AppError with its status, code, details and the request id', () => {
    const res = format(new ConflictError('No stock', [{ menuItemId: 'a' }], 'INSUFFICIENT_STOCK'));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'No stock',
        details: [{ menuItemId: 'a' }],
        requestId: 'req-1',
      },
    });
  });

  it('lists validation problems by path', () => {
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: 'x' });
    const res = format(parsed.success ? null : parsed.error);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      error: { code: 'VALIDATION_ERROR', details: [{ path: 'email' }] },
    });
  });

  it('answers bad JSON and oversized bodies from the body parser', () => {
    expect(format({ type: 'entity.parse.failed' }).body).toMatchObject({
      error: { code: 'INVALID_JSON' },
    });
    const big = format({ type: 'entity.too.large' });
    expect(big.statusCode).toBe(413);
  });

  it('maps a database constraint error to a 409', () => {
    expect(format({ code: '23505', constraint: 'x' }).statusCode).toBe(409);
  });

  it('hides the details of an unexpected error behind a generic 500', () => {
    const res = format(new Error('connection to 10.0.0.5 refused, password=hunter2'));
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again later.',
        requestId: 'req-1',
      },
    });
  });

  it('turns an unknown route into a ROUTE_NOT_FOUND error', () => {
    const { error } = run(notFound, { method: 'GET', path: '/nope' });
    expect(error).toMatchObject({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      message: 'Route GET /nope was not found.',
    });
  });
});

describe('requestId', () => {
  const withHeader = (value?: string) => {
    const req = { get: () => value } as unknown as Request;
    const { res } = run(requestId, req);
    return { id: req.requestId, header: res.headers['x-request-id'] };
  };

  it('keeps a well-formed incoming id and echoes it', () => {
    expect(withHeader('trace-123456')).toEqual({ id: 'trace-123456', header: 'trace-123456' });
  });

  it('replaces a missing or unsafe id with a new UUID', () => {
    for (const value of [undefined, 'short', 'has spaces in it', '<script>alert(1)</script>']) {
      const { id, header } = withHeader(value);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(header).toBe(id);
    }
  });
});

describe('authorize and requireOutletAccess', () => {
  it('lets a listed role through and stops the others with ROLE_FORBIDDEN', () => {
    expect(run(authorize('HQ_ADMIN'), { auth: hq }).next).toHaveBeenCalledWith();
    expect(() => run(authorize('HQ_ADMIN'), { auth: staff })).toThrow(
      expect.objectContaining({ code: 'ROLE_FORBIDDEN' }),
    );
    expect(() => run(authorize('HQ_ADMIN'), {})).toThrow(expect.objectContaining({ status: 401 }));
  });

  it('lets HQ reach any outlet and staff only their own', () => {
    expect(
      run(requireOutletAccess(), { auth: hq, params: { outletId: OTHER } }).next,
    ).toHaveBeenCalledWith();
    expect(
      run(requireOutletAccess(), { auth: staff, params: { outletId: OUTLET } }).next,
    ).toHaveBeenCalledWith();
    expect(() => run(requireOutletAccess(), { auth: staff, params: { outletId: OTHER } })).toThrow(
      expect.objectContaining({ status: 403, code: 'OUTLET_FORBIDDEN' }),
    );
    expect(() => run(requireOutletAccess(), { params: { outletId: OUTLET } })).toThrow(
      expect.objectContaining({ status: 401 }),
    );
  });
});
