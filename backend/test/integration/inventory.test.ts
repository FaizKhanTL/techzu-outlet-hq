import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool';
import {
  api,
  auth,
  createMenuItem,
  createOutlet,
  createUser,
  resetDatabase,
  stockOf,
  storeFixture,
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

const adjust = (token: string, outletId: string, menuItemId: string, body: object) =>
  api()
    .post(`/api/v1/outlets/${outletId}/inventory/${menuItemId}/adjustments`)
    .set(auth(token))
    .send(body);

describe('inventory', () => {
  it('lets staff restock and record waste, writing the ledger', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 0 });
    const added = await adjust(staff.token, outlet.id, item.id, {
      quantityDelta: 20,
      reason: 'RESTOCK',
      note: 'Delivery',
    });
    expect(added.status).toBe(201);
    expect(added.body.data).toMatchObject({
      quantity: 20,
      movement: { quantityDelta: 20, quantityAfter: 20, reason: 'RESTOCK' },
    });
    const wasted = await adjust(staff.token, outlet.id, item.id, {
      quantityDelta: -3,
      reason: 'WASTE',
    });
    expect(wasted.body.data.quantity).toBe(17);

    const ledger = await api()
      .get(`/api/v1/outlets/${outlet.id}/inventory/${item.id}/movements`)
      .set(auth(staff.token));
    expect(
      ledger.body.data.map((m: { reason: string; quantityAfter: number }) => [
        m.reason,
        m.quantityAfter,
      ]),
    ).toEqual([
      ['WASTE', 17],
      ['RESTOCK', 20],
    ]);
    const list = await api().get(`/api/v1/outlets/${outlet.id}/inventory`).set(auth(staff.token));
    expect(list.body.data).toEqual([
      expect.objectContaining({ menuItemId: item.id, quantity: 17 }),
    ]);
  });

  it('never lets stock go below zero, and leaves it unchanged when refused', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 5 });
    const res = await adjust(staff.token, outlet.id, item.id, {
      quantityDelta: -6,
      reason: 'CORRECTION',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { available: 5, requested: 6 },
    });
    expect(await stockOf(outlet.id, item.id)).toBe(5);
    expect(
      (await adjust(staff.token, outlet.id, item.id, { quantityDelta: -5, reason: 'CORRECTION' }))
        .body.data.quantity,
    ).toBe(0);
  });

  it('keeps stock right under concurrent removals: exactly as many succeed as there is stock', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 10 });
    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        adjust(staff.token, outlet.id, item.id, { quantityDelta: -1, reason: 'WASTE' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409)).toHaveLength(15);
    expect(await stockOf(outlet.id, item.id)).toBe(0);
  });

  it('checks the direction of RESTOCK and WASTE, and refuses zero', async () => {
    const { outlet, staff, item } = await storeFixture();
    for (const body of [
      { quantityDelta: -1, reason: 'RESTOCK' },
      { quantityDelta: 1, reason: 'WASTE' },
      { quantityDelta: 0, reason: 'CORRECTION' },
      { quantityDelta: 1.5, reason: 'RESTOCK' },
      { quantityDelta: 1, reason: 'SALE' },
    ]) {
      expect((await adjust(staff.token, outlet.id, item.id, body)).status).toBe(400);
    }
  });

  it('answers 404 for an item not assigned to the outlet, and 403 for another outlet', async () => {
    const { hq, outlet, staff } = await storeFixture();
    const loose = await createMenuItem(hq.token);
    const res = await adjust(staff.token, outlet.id, loose.id, {
      quantityDelta: 1,
      reason: 'RESTOCK',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_ASSIGNED');

    const other = await createOutlet(hq.token);
    const foreign = await createUser('OUTLET_STAFF', other.id);
    expect(
      (await api().get(`/api/v1/outlets/${outlet.id}/inventory`).set(auth(foreign.token))).status,
    ).toBe(403);
  });
});
