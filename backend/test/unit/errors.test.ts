import { describe, expect, it } from 'vitest';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
} from '../../src/lib/errors';
import { fromPgError } from '../../src/lib/pg-errors';

describe('AppError classes', () => {
  it.each([
    [new BadRequestError('x'), 400, 'BAD_REQUEST'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
    [new ForbiddenError(), 403, 'FORBIDDEN'],
    [new NotFoundError('Outlet'), 404, 'NOT_FOUND'],
    [new ConflictError('x'), 409, 'CONFLICT'],
    [new UnprocessableError('x'), 422, 'UNPROCESSABLE'],
  ])('%s has its status and default code', (error, status, code) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status, code });
  });

  it('names the missing resource and keeps a custom code', () => {
    expect(new NotFoundError('Menu item', 'NOT_ASSIGNED')).toMatchObject({
      message: 'Menu item was not found.',
      code: 'NOT_ASSIGNED',
      name: 'NotFoundError',
    });
  });
});

describe('fromPgError', () => {
  it.each([
    ['23505', 409, 'DUPLICATE'],
    ['23503', 409, 'REFERENCE_CONFLICT'],
    ['23514', 409, 'CONSTRAINT_VIOLATION'],
    ['22P02', 400, 'INVALID_VALUE'],
    ['22003', 400, 'INVALID_VALUE'],
    ['55P03', 503, 'BUSY'],
    ['57014', 503, 'TIMEOUT'],
  ])('maps SQLSTATE %s to %i %s', (code, status, appCode) => {
    expect(fromPgError({ code, constraint: 'some_constraint' })).toMatchObject({
      status,
      code: appCode,
    });
  });

  it('passes the constraint name on for constraint errors, never the SQL detail', () => {
    const mapped = fromPgError({
      code: '23505',
      constraint: 'menu_items_sku_key',
      detail: 'Key (sku)=(X) exists',
    });
    expect(mapped?.details).toEqual({ constraint: 'menu_items_sku_key' });
    expect(JSON.stringify(mapped)).not.toContain('Key (sku)');
  });

  it('leaves anything else for the 500 handler', () => {
    expect(fromPgError({ code: '42P01' })).toBeUndefined();
    expect(fromPgError(new Error('boom'))).toBeUndefined();
    expect(fromPgError(null)).toBeUndefined();
    expect(fromPgError('text')).toBeUndefined();
  });
});
