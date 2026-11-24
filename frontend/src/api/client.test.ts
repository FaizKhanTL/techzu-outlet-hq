import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, getToken, setToken, setUnauthorizedHandler } from './client';
import { fakeApi } from '../test/utils';

describe('api client', () => {
  it('sends the token, JSON body and extra headers, and drops empty query values', async () => {
    const calls = fakeApi(() => [200, { data: 1 }]);
    setToken('tok-1');
    await api('/things', {
      method: 'POST',
      body: { a: 1 },
      query: { limit: 5, from: undefined, to: '', active: false },
      headers: { 'Idempotency-Key': 'k-12345678' },
    });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/things?limit=5&active=false',
      body: { a: 1 },
      headers: {
        Authorization: 'Bearer tok-1',
        'Content-Type': 'application/json',
        'Idempotency-Key': 'k-12345678',
      },
    });
  });

  it('turns an API error body into an ApiError with its code and message', async () => {
    fakeApi(() => [
      409,
      {
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock.',
          details: [1],
          requestId: 'r1',
        },
      },
    ]);
    const error = await api('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      message: 'Not enough stock.',
      details: [1],
      requestId: 'r1',
    });
    expect(errorMessage(error)).toBe('Not enough stock.');
  });

  it('gives a readable error when the response is not the API format', async () => {
    fakeApi(() => [502]);
    expect(await api('/x').catch((e: unknown) => e)).toMatchObject({
      status: 502,
      code: 'NETWORK_ERROR',
    });
  });

  it('signs the user out on a 401 while a token is held, and not otherwise', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fakeApi(() => [401, { error: { code: 'INVALID_TOKEN', message: 'expired' } }]);
    setToken(null);
    await api('/x').catch(() => undefined);
    expect(handler).not.toHaveBeenCalled();
    setToken('tok');
    await api('/x').catch(() => undefined);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('keeps the token in session storage only', () => {
    setToken('tok-2');
    expect(sessionStorage.getItem('outlet-hq.token')).toBe('tok-2');
    expect(getToken()).toBe('tok-2');
    setToken(null);
    expect(sessionStorage.getItem('outlet-hq.token')).toBeNull();
  });

  it('returns nothing for 204', async () => {
    fakeApi(() => [204]);
    expect(await api('/x', { method: 'DELETE' })).toBeUndefined();
  });
});
