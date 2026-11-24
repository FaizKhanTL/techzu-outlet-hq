import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../../src/db/pool';
import {
  api,
  assignItem,
  auth,
  createMenuItem,
  createOutlet,
  createUser,
  resetDatabase,
  restock,
  sell,
  storeFixture,
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('lists, filters and pages', () => {
  it('pages sales newest first and filters them by date', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 100 });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(
        (await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }])).body.data.id,
      );
    await pool.query(`UPDATE sales SET created_at = '2026-03-01T10:00:00Z' WHERE id = ANY($1)`, [
      ids.slice(0, 2),
    ]);

    const url = `/api/v1/outlets/${outlet.id}/sales`;
    const first = await api().get(`${url}?limit=2`).set(auth(staff.token));
    expect(first.body.meta).toEqual({ limit: 2, offset: 0, total: 5 });
    expect(first.body.data.map((s: { receiptSeq: number }) => s.receiptSeq)).toEqual([5, 4]);
    const last = await api().get(`${url}?limit=2&offset=4`).set(auth(staff.token));
    expect(last.body.data.map((s: { receiptSeq: number }) => s.receiptSeq)).toEqual([1]);

    const march = await api()
      .get(`${url}?from=2026-03-01T00:00:00Z&to=2026-03-02T00:00:00Z`)
      .set(auth(staff.token));
    expect(march.body.meta.total).toBe(2);
    expect((await api().get(`${url}?limit=0`).set(auth(staff.token))).status).toBe(400);
  });

  it('does not show one outlet a sale of another, even by id', async () => {
    const { hq, outlet, staff, item } = await storeFixture();
    const other = await createOutlet(hq.token);
    await assignItem(hq.token, other.id, item.id);
    await restock(hq.token, other.id, item.id, 5);
    const foreignSale = await sell(hq.token, other.id, [{ menuItemId: item.id, quantity: 1 }]);
    const res = await api()
      .get(`/api/v1/outlets/${outlet.id}/sales/${foreignSale.body.data.id}`)
      .set(auth(staff.token));
    expect(res.status).toBe(404);
  });

  it('pages the stock ledger newest first', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 10 });
    await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 3 }]);
    await restock(staff.token, outlet.id, item.id, 4);
    const res = await api()
      .get(`/api/v1/outlets/${outlet.id}/inventory/${item.id}/movements?limit=2`)
      .set(auth(staff.token));
    expect(res.body.meta.total).toBe(3);
    expect(
      res.body.data.map((m: { reason: string; quantityAfter: number }) => [
        m.reason,
        m.quantityAfter,
      ]),
    ).toEqual([
      ['RESTOCK', 11],
      ['SALE', 7],
    ]);
    expect(res.body.data[1].saleId).toEqual(expect.any(String));
  });

  it('searches outlets and menu items, and filters by status', async () => {
    const hq = await createUser('HQ_ADMIN');
    await createOutlet(hq.token, { code: 'KLCC', name: 'KLCC Flagship' });
    const pj = await createOutlet(hq.token, { code: 'PJ', name: 'Petaling Jaya' });
    await api().patch(`/api/v1/outlets/${pj.id}`).set(auth(hq.token)).send({ isActive: false });
    await createMenuItem(hq.token, { sku: 'COF-LATTE', name: 'Cafe Latte', category: 'Coffee' });
    await createMenuItem(hq.token, { sku: 'TEA-1', name: 'Teh Tarik', category: 'Tea' });

    const byName = await api().get('/api/v1/outlets?search=flag').set(auth(hq.token));
    expect(byName.body.data.map((o: { code: string }) => o.code)).toEqual(['KLCC']);
    const inactive = await api().get('/api/v1/outlets?isActive=false').set(auth(hq.token));
    expect(inactive.body.data.map((o: { code: string }) => o.code)).toEqual(['PJ']);
    const latte = await api().get('/api/v1/menu-items?search=latte').set(auth(hq.token));
    expect(latte.body.data.map((m: { sku: string }) => m.sku)).toEqual(['COF-LATTE']);
    // A % in the search is a literal character, not a wildcard that matches everything.
    expect(
      (await api().get('/api/v1/menu-items?search=%25').set(auth(hq.token))).body.meta.total,
    ).toBe(0);
  });
});
