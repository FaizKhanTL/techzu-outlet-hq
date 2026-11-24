import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
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
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

/** Two outlets and four items; A sells most, B sells a little, C sells nothing. */
async function world() {
  const hq = await createUser('HQ_ADMIN');
  const a = await createOutlet(hq.token, { code: 'AAA' });
  const b = await createOutlet(hq.token, { code: 'BBB' });
  const c = await createOutlet(hq.token, { code: 'CCC' });
  const items = await Promise.all(
    ['Apple', 'Banana', 'Cherry', 'Durian', 'Elder', 'Fig'].map((name, i) =>
      createMenuItem(hq.token, { name, basePriceCents: 100 * (i + 1) }),
    ),
  );
  for (const outlet of [a, b]) {
    for (const item of items) {
      await assignItem(hq.token, outlet.id, item.id);
      await restock(hq.token, outlet.id, item.id, 100);
    }
  }
  return { hq, a, b, c, items };
}

describe('reports', () => {
  it('reports revenue by outlet, including outlets with no sales, highest first', async () => {
    const { hq, a, b, c, items } = await world();
    await sell(hq.token, a.id, [{ menuItemId: items[5]!.id, quantity: 3 }]); // 1800
    await sell(hq.token, a.id, [{ menuItemId: items[0]!.id, quantity: 2 }]); // 200
    await sell(hq.token, b.id, [{ menuItemId: items[1]!.id, quantity: 1 }]); // 200

    const res = await api().get('/api/v1/reports/revenue-by-outlet').set(auth(hq.token));
    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({ saleCount: 3, itemsSold: 6, revenueCents: 2200 });
    expect(
      res.body.data.outlets.map(
        (o: { outletId: string; revenueCents: number; saleCount: number }) => [
          o.outletId,
          o.revenueCents,
          o.saleCount,
        ],
      ),
    ).toEqual([
      [a.id, 2000, 2],
      [b.id, 200, 1],
      [c.id, 0, 0],
    ]);
  });

  it('filters by date range: from inclusive, to exclusive', async () => {
    const { hq, a, items } = await world();
    const old = await sell(hq.token, a.id, [{ menuItemId: items[0]!.id, quantity: 1 }]);
    await sell(hq.token, a.id, [{ menuItemId: items[0]!.id, quantity: 1 }]);
    await pool.query(`UPDATE sales SET created_at = '2026-01-01T00:00:00Z' WHERE id = $1`, [
      old.body.data.id,
    ]);

    const jan = await api()
      .get('/api/v1/reports/revenue-by-outlet?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z')
      .set(auth(hq.token));
    expect(jan.body.data.totals.saleCount).toBe(1);
    const before = await api()
      .get('/api/v1/reports/revenue-by-outlet?to=2026-01-01T00:00:00Z')
      .set(auth(hq.token));
    expect(before.body.data.totals.saleCount).toBe(0);

    const backwards = await api()
      .get('/api/v1/reports/revenue-by-outlet?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z')
      .set(auth(hq.token));
    expect(backwards.status).toBe(400);
    expect(
      (await api().get('/api/v1/reports/revenue-by-outlet?from=yesterday').set(auth(hq.token)))
        .status,
    ).toBe(400);
  });

  it('ranks the top 5 items per outlet by quantity, breaking ties by revenue then name', async () => {
    const { hq, a, b, items } = await world();
    const [apple, banana, cherry, durian, elder, fig] = items;
    // A: Fig 5, Elder 4, Banana 3 and Cherry 3 (Cherry earns more), Apple 1 and Durian 1 (Durian earns more).
    for (const [item, quantity] of [
      [fig, 5],
      [elder, 4],
      [banana, 3],
      [cherry, 3],
      [apple, 1],
      [durian, 1],
    ] as const) {
      await sell(hq.token, a.id, [{ menuItemId: item!.id, quantity }]);
    }
    await sell(hq.token, b.id, [{ menuItemId: apple!.id, quantity: 7 }]);

    const res = await api().get('/api/v1/reports/top-items').set(auth(hq.token));
    const byOutlet = Object.fromEntries(
      res.body.data.outlets.map(
        (o: {
          outletId: string;
          items: { name: string; rank: number; quantitySold: number }[];
        }) => [o.outletId, o.items.map((item) => [item.rank, item.name, item.quantitySold])],
      ),
    );
    expect(byOutlet[a.id]).toEqual([
      [1, 'Fig', 5],
      [2, 'Elder', 4],
      [3, 'Cherry', 3],
      [4, 'Banana', 3],
      [5, 'Durian', 1],
    ]);
    expect(byOutlet[b.id]).toEqual([[1, 'Apple', 7]]);
    expect(res.body.data.outlets).toHaveLength(3); // the outlet with no sales is listed, empty

    const three = await api()
      .get(`/api/v1/reports/top-items?outletId=${a.id}&limit=3`)
      .set(auth(hq.token));
    expect(three.body.data.outlets).toHaveLength(1);
    expect(three.body.data.outlets[0].items).toHaveLength(3);
  });

  it('gives staff only their own outlet', async () => {
    const { hq, a, b, items } = await world();
    await sell(hq.token, a.id, [{ menuItemId: items[0]!.id, quantity: 1 }]);
    const staff = await createUser('OUTLET_STAFF', a.id);

    const own = await api().get('/api/v1/reports/top-items').set(auth(staff.token));
    expect(own.body.data.outlets.map((o: { outletId: string }) => o.outletId)).toEqual([a.id]);
    const foreign = await api()
      .get(`/api/v1/reports/top-items?outletId=${b.id}`)
      .set(auth(staff.token));
    expect(foreign.status).toBe(403);
    expect(
      (await api().get('/api/v1/reports/revenue-by-outlet').set(auth(staff.token))).status,
    ).toBe(403);
  });
});
