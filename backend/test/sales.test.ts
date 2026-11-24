import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
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
  stockOf,
  storeFixture,
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

const seqs = async (outletId: string) =>
  (
    await pool.query<{ receipt_seq: number }>(
      'SELECT receipt_seq FROM sales WHERE outlet_id = $1 ORDER BY receipt_seq',
      [outletId],
    )
  ).rows.map((row) => row.receipt_seq);

describe('sales', () => {
  it('records a multi-item sale at the outlet price, deducts stock and numbers the receipt', async () => {
    const { hq, outlet, staff, item } = await storeFixture({
      stock: 10,
      basePriceCents: 1000,
      priceOverrideCents: 1250,
    });
    const tea = await createMenuItem(hq.token, { basePriceCents: 600 });
    await assignItem(hq.token, outlet.id, tea.id);
    await restock(hq.token, outlet.id, tea.id, 5);

    const res = await sell(staff.token, outlet.id, [
      { menuItemId: item.id, quantity: 2 },
      { menuItemId: tea.id, quantity: 3 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      receiptSeq: 1,
      receiptNumber: `${outlet.code}-000001`,
      totalCents: 2 * 1250 + 3 * 600,
      itemCount: 5,
      paymentMethod: 'CASH',
      currency: 'MYR',
    });
    expect(res.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          menuItemId: item.id,
          unitPriceCents: 1250,
          quantity: 2,
          lineTotalCents: 2500,
        }),
        expect.objectContaining({
          menuItemId: tea.id,
          unitPriceCents: 600,
          quantity: 3,
          lineTotalCents: 1800,
        }),
      ]),
    );
    expect(await stockOf(outlet.id, item.id)).toBe(8);
    expect(await stockOf(outlet.id, tea.id)).toBe(2);

    const ledger = await pool.query(
      'SELECT reason, quantity_delta, sale_id FROM inventory_movements WHERE sale_id = $1',
      [res.body.data.id],
    );
    expect(ledger.rows).toHaveLength(2);

    const second = await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]);
    expect(second.body.data.receiptNumber).toBe(`${outlet.code}-000002`);

    const fetched = await api()
      .get(`/api/v1/outlets/${outlet.id}/sales/${res.body.data.id}`)
      .set(auth(staff.token));
    expect(fetched.body.data.totalCents).toBe(4300);
    const list = await api().get(`/api/v1/outlets/${outlet.id}/sales`).set(auth(staff.token));
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].receiptSeq).toBe(2); // newest first
  });

  it('merges the same item sent twice into one line', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 10 });
    const res = await sell(staff.token, outlet.id, [
      { menuItemId: item.id, quantity: 2 },
      { menuItemId: item.id, quantity: 3 },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ quantity: 5, lineTotalCents: 5000 }),
    ]);
    expect(await stockOf(outlet.id, item.id)).toBe(5);
  });

  it('refuses a sale without enough stock, changes nothing, and does not use up a receipt number', async () => {
    const { hq, outlet, staff, item } = await storeFixture({ stock: 3 });
    const other = await createMenuItem(hq.token);
    await assignItem(hq.token, outlet.id, other.id);
    await restock(hq.token, outlet.id, other.id, 10);

    const res = await sell(staff.token, outlet.id, [
      { menuItemId: other.id, quantity: 1 },
      { menuItemId: item.id, quantity: 4 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([
      expect.objectContaining({ menuItemId: item.id, requested: 4, available: 3 }),
    ]);
    expect(await stockOf(outlet.id, item.id)).toBe(3);
    expect(await stockOf(outlet.id, other.id)).toBe(10); // the other line was rolled back too
    expect(await seqs(outlet.id)).toEqual([]);

    const ok = await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 3 }]);
    expect(ok.body.data.receiptSeq).toBe(1);
  });

  it('refuses items not on the outlet menu, paused, or retired on the master menu', async () => {
    const { hq, outlet, staff, item } = await storeFixture();
    const loose = await createMenuItem(hq.token);
    const notOnMenu = await sell(staff.token, outlet.id, [{ menuItemId: loose.id, quantity: 1 }]);
    expect(notOnMenu.status).toBe(422);
    expect(notOnMenu.body.error).toMatchObject({
      code: 'ITEMS_NOT_SELLABLE',
      details: [{ menuItemId: loose.id, reason: 'NOT_ON_OUTLET_MENU' }],
    });

    await api()
      .patch(`/api/v1/outlets/${outlet.id}/menu-items/${item.id}`)
      .set(auth(staff.token))
      .send({ isAvailable: false });
    expect(
      (await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }])).body.error
        .details[0].reason,
    ).toBe('UNAVAILABLE');
    await api()
      .patch(`/api/v1/outlets/${outlet.id}/menu-items/${item.id}`)
      .set(auth(staff.token))
      .send({ isAvailable: true });
    await api()
      .patch(`/api/v1/menu-items/${item.id}`)
      .set(auth(hq.token))
      .send({ isActive: false });
    expect(
      (await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }])).status,
    ).toBe(422);
    expect(await stockOf(outlet.id, item.id)).toBe(100);
  });

  it('uses the price in effect at the time and keeps it on the receipt after the price changes', async () => {
    const { hq, outlet, staff, item } = await storeFixture({ basePriceCents: 1000 });
    const first = await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]);
    await assignItem(hq.token, outlet.id, item.id, { priceOverrideCents: 1500 });
    await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]);
    const old = await api()
      .get(`/api/v1/outlets/${outlet.id}/sales/${first.body.data.id}`)
      .set(auth(staff.token));
    expect(old.body.data.totalCents).toBe(1000);
  });

  it('ignores nothing silently: a price, unknown fields, or no items are 400', async () => {
    const { outlet, staff, item } = await storeFixture();
    const url = `/api/v1/outlets/${outlet.id}/sales`;
    const cases = [
      { items: [{ menuItemId: item.id, quantity: 1, unitPriceCents: 1 }], paymentMethod: 'CASH' },
      { items: [], paymentMethod: 'CASH' },
      { items: [{ menuItemId: item.id, quantity: 0 }], paymentMethod: 'CASH' },
      { items: [{ menuItemId: item.id, quantity: 1 }], paymentMethod: 'CHEQUE' },
      { items: [{ menuItemId: item.id, quantity: 1 }], paymentMethod: 'CASH', totalCents: 1 },
    ];
    for (const body of cases)
      expect((await api().post(url).set(auth(staff.token)).send(body)).status).toBe(400);
  });

  it('refuses a sale at an inactive outlet, and staff selling for another outlet', async () => {
    const { hq, outlet, staff, item } = await storeFixture();
    const other = await createOutlet(hq.token);
    expect((await sell(staff.token, other.id, [{ menuItemId: item.id, quantity: 1 }])).status).toBe(
      403,
    );

    await api().patch(`/api/v1/outlets/${outlet.id}`).set(auth(hq.token)).send({ isActive: false });
    const res = await sell(hq.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OUTLET_INACTIVE');
  });

  describe('idempotency', () => {
    it('returns the original sale for a retried key, without selling twice', async () => {
      const { outlet, staff, item } = await storeFixture({ stock: 10 });
      const key = randomUUID();
      const first = await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 2 }], key);
      const retry = await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 2 }], key);
      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(retry.body.data.id).toBe(first.body.data.id);
      expect(await stockOf(outlet.id, item.id)).toBe(8);
    });

    it('refuses the same key for a different sale, and a malformed key', async () => {
      const { outlet, staff, item } = await storeFixture({ stock: 10 });
      const key = randomUUID();
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }], key);
      const reused = await sell(
        staff.token,
        outlet.id,
        [{ menuItemId: item.id, quantity: 2 }],
        key,
      );
      expect(reused.status).toBe(409);
      expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const bad = await sell(
        staff.token,
        outlet.id,
        [{ menuItemId: item.id, quantity: 1 }],
        'bad key!',
      );
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });

    it('records one sale when the same key arrives many times at once', async () => {
      const { outlet, staff, item } = await storeFixture({ stock: 50 });
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }], key),
        ),
      );
      expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
      expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(await stockOf(outlet.id, item.id)).toBe(49);
      expect(await seqs(outlet.id)).toEqual([1]);
    });
  });

  describe('under concurrency', () => {
    it('gives parallel sales unique, sequential, gap-free receipt numbers', async () => {
      const { outlet, staff, item } = await storeFixture({ stock: 1000 });
      const results = await Promise.all(
        Array.from({ length: 40 }, () =>
          sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      expect(await seqs(outlet.id)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
      expect(await stockOf(outlet.id, item.id)).toBe(960);
    });

    it('never oversells: with 10 in stock, exactly 10 of 30 parallel sales succeed', async () => {
      const { outlet, staff, item } = await storeFixture({ stock: 10 });
      const results = await Promise.all(
        Array.from({ length: 30 }, () =>
          sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }]),
        ),
      );
      expect(results.filter((r) => r.status === 201)).toHaveLength(10);
      expect(results.filter((r) => r.status === 409)).toHaveLength(20);
      expect(await stockOf(outlet.id, item.id)).toBe(0);
      expect(await seqs(outlet.id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    });

    it('does not deadlock when parallel sales list the same items in opposite order', async () => {
      const { hq, outlet, staff, item } = await storeFixture({ stock: 500 });
      const other = await createMenuItem(hq.token);
      await assignItem(hq.token, outlet.id, other.id);
      await restock(hq.token, outlet.id, other.id, 500);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, i) =>
          sell(
            staff.token,
            outlet.id,
            i % 2
              ? [
                  { menuItemId: item.id, quantity: 1 },
                  { menuItemId: other.id, quantity: 1 },
                ]
              : [
                  { menuItemId: other.id, quantity: 1 },
                  { menuItemId: item.id, quantity: 1 },
                ],
          ),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(30).fill(201));
      expect(await stockOf(outlet.id, item.id)).toBe(470);
      expect(await stockOf(outlet.id, other.id)).toBe(470);
    });

    it('numbers each outlet on its own', async () => {
      const hq = await createUser('HQ_ADMIN');
      const item = await createMenuItem(hq.token);
      const outlets = [await createOutlet(hq.token), await createOutlet(hq.token)];
      for (const outlet of outlets) {
        await assignItem(hq.token, outlet.id, item.id);
        await restock(hq.token, outlet.id, item.id, 100);
      }
      await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          sell(hq.token, outlets[i % 2]!.id, [{ menuItemId: item.id, quantity: 1 }]),
        ),
      );
      for (const outlet of outlets)
        expect(await seqs(outlet.id)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    });
  });
});
