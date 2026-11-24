import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Api, DEMO } from './support';

test.describe('the deployed stack', () => {
  test('serves the app with security headers and a fallback for deep links', async ({
    request,
  }) => {
    for (const path of ['/', '/outlet/pos', '/hq/outlets/some-id']) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(await res.text()).toContain('<div id="root">');
      expect(res.headers()['x-frame-options']).toBe('DENY');
      expect(res.headers()['x-content-type-options']).toBe('nosniff');
    }
  });

  test('answers API errors in one shape, with the request id', async ({ request }) => {
    const res = await request.get('/api/v1/menu-items');
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: 'TOKEN_REQUIRED' });
    expect(body.error.requestId).toBe(res.headers()['x-request-id']);
  });

  test('records a retried sale once', async ({ request }) => {
    const hq = await Api.as(request, DEMO.hq);
    const orchard = await hq.outletIdByCode('ORCHARD');
    const item = await hq.stockedItem(orchard, { name: 'Retry test', stock: 5 });
    const key = randomUUID();
    const body = { items: [{ menuItemId: item.id, quantity: 1 }], paymentMethod: 'CASH' };
    const first = await hq.call<{ id: string }>('POST', `/outlets/${orchard}/sales`, body, {
      'Idempotency-Key': key,
    });
    const retry = await hq.call<{ id: string }>('POST', `/outlets/${orchard}/sales`, body, {
      'Idempotency-Key': key,
    });
    expect([first.status, retry.status]).toEqual([201, 200]);
    expect(retry.body.data.id).toBe(first.body.data.id);
    const stock = await hq.call<{ menuItemId: string; quantity: number }[]>(
      'GET',
      `/outlets/${orchard}/inventory`,
    );
    expect(stock.body.data.find((row) => row.menuItemId === item.id)?.quantity).toBe(4);
  });
});
