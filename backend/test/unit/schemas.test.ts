import { describe, expect, it } from 'vitest';
import {
  createSaleSchemas,
  idempotencyKeySchema,
  listSalesSchemas,
} from '../../src/modules/sales/sales.schemas';
import { adjustStockSchemas } from '../../src/modules/inventory/inventory.schemas';
import {
  createOutletSchemas,
  updateOutletSchemas,
} from '../../src/modules/outlets/outlets.schemas';
import { createMenuItemSchemas } from '../../src/modules/menu-items/menu-items.schemas';
import { assignSchemas } from '../../src/modules/outlet-menu/outlet-menu.schemas';
import { topItemsSchemas } from '../../src/modules/reports/reports.schemas';
import { listOutletsSchemas } from '../../src/modules/outlets/outlets.schemas';

const ID = '00000000-0000-4000-8000-000000000001';
const sale = (body: object) => createSaleSchemas.body.safeParse(body);
const line = (quantity: number) => ({ menuItemId: ID, quantity });

describe('sale body', () => {
  it('accepts a normal sale and turns a blank note into null', () => {
    const parsed = sale({ items: [line(2)], paymentMethod: 'E_WALLET', note: '   ' });
    expect(parsed.success && parsed.data).toEqual({
      items: [line(2)],
      paymentMethod: 'E_WALLET',
      note: null,
    });
  });

  it.each([
    ['a client price', { items: [{ ...line(1), unitPriceCents: 1 }], paymentMethod: 'CASH' }],
    ['a total', { items: [line(1)], paymentMethod: 'CASH', totalCents: 1 }],
    ['no items', { items: [], paymentMethod: 'CASH' }],
    ['51 lines', { items: Array.from({ length: 51 }, () => line(1)), paymentMethod: 'CASH' }],
    ['quantity 0', { items: [line(0)], paymentMethod: 'CASH' }],
    ['quantity 1000', { items: [line(1000)], paymentMethod: 'CASH' }],
    ['a fractional quantity', { items: [line(1.5)], paymentMethod: 'CASH' }],
    ['an unknown payment method', { items: [line(1)], paymentMethod: 'CHEQUE' }],
    ['a malformed item id', { items: [{ menuItemId: 'x', quantity: 1 }], paymentMethod: 'CASH' }],
    [
      'a note over 300 characters',
      { items: [line(1)], paymentMethod: 'CASH', note: 'x'.repeat(301) },
    ],
  ])('refuses %s', (_name, body) => {
    expect(sale(body).success).toBe(false);
  });

  it('checks the Idempotency-Key format', () => {
    expect(idempotencyKeySchema.safeParse('3b1f6c2e-0f53-4b8f-9c07-8d0b8e2f9a10').success).toBe(
      true,
    );
    for (const key of ['short', 'has space here', 'x'.repeat(129), 'semi;colon-key']) {
      expect(idempotencyKeySchema.safeParse(key).success).toBe(false);
    }
  });

  it('refuses a date range that ends before it starts', () => {
    const query = listSalesSchemas.query.safeParse({
      from: '2026-02-01T00:00:00Z',
      to: '2026-01-01T00:00:00Z',
    });
    expect(query.success).toBe(false);
    expect(listSalesSchemas.query.safeParse({ from: '2026-01-01T00:00:00+08:00' }).success).toBe(
      true,
    );
    expect(listSalesSchemas.query.safeParse({ from: '2026-01-01' }).success).toBe(false); // needs a time zone
  });
});

describe('stock adjustment body', () => {
  const adjust = (body: object) => adjustStockSchemas.body.safeParse(body).success;

  it('needs RESTOCK to add and WASTE to remove; CORRECTION may do either', () => {
    expect(adjust({ quantityDelta: 5, reason: 'RESTOCK' })).toBe(true);
    expect(adjust({ quantityDelta: -5, reason: 'RESTOCK' })).toBe(false);
    expect(adjust({ quantityDelta: -5, reason: 'WASTE' })).toBe(true);
    expect(adjust({ quantityDelta: 5, reason: 'WASTE' })).toBe(false);
    expect(adjust({ quantityDelta: -5, reason: 'CORRECTION' })).toBe(true);
    expect(adjust({ quantityDelta: 5, reason: 'CORRECTION' })).toBe(true);
  });

  it('refuses zero, fractions, huge numbers and the SALE reason', () => {
    expect(adjust({ quantityDelta: 0, reason: 'CORRECTION' })).toBe(false);
    expect(adjust({ quantityDelta: 1.5, reason: 'RESTOCK' })).toBe(false);
    expect(adjust({ quantityDelta: 100_001, reason: 'RESTOCK' })).toBe(false);
    expect(adjust({ quantityDelta: 1, reason: 'SALE' })).toBe(false);
  });
});

describe('outlet and menu bodies', () => {
  it('normalises an outlet code to upper case and trims names', () => {
    const parsed = createOutletSchemas.body.safeParse({ code: ' orchard-2 ', name: '  Orchard  ' });
    expect(parsed.success && parsed.data).toEqual({
      code: 'ORCHARD-2',
      name: 'Orchard',
      address: null,
    });
  });

  it.each(['k', '-ORCHARD', 'ORC HARD', 'A'.repeat(17), 'ORCHARD!'])(
    'refuses the outlet code %j',
    (code) => {
      expect(createOutletSchemas.body.safeParse({ code, name: 'x' }).success).toBe(false);
    },
  );

  it('refuses an empty update and the immutable code', () => {
    expect(updateOutletSchemas.body.safeParse({}).success).toBe(false);
    expect(updateOutletSchemas.body.safeParse({ code: 'NEW' }).success).toBe(false);
  });

  it('checks the SKU and price of a menu item', () => {
    const ok = createMenuItemSchemas.body.safeParse({
      sku: 'cof_latte-1',
      name: 'Latte',
      basePriceCents: 0,
    });
    expect(ok.success && ok.data).toMatchObject({
      sku: 'COF_LATTE-1',
      category: 'General',
      basePriceCents: 0,
    });
    for (const basePriceCents of [-1, 0.5, 100_000_001, '12']) {
      expect(
        createMenuItemSchemas.body.safeParse({ sku: 'A1', name: 'A', basePriceCents }).success,
      ).toBe(false);
    }
  });

  it('lets an assignment clear its price override with null but not set a negative one', () => {
    expect(assignSchemas.body.safeParse({ priceOverrideCents: null }).success).toBe(true);
    expect(assignSchemas.body.safeParse({}).success).toBe(true);
    expect(assignSchemas.body.safeParse({ priceOverrideCents: -1 }).success).toBe(false);
  });
});

describe('query strings', () => {
  it('coerces pagination and applies its defaults and bounds', () => {
    const parsed = listOutletsSchemas.query.safeParse({});
    expect(parsed.success && parsed.data).toMatchObject({ limit: 20, offset: 0 });
    expect(listOutletsSchemas.query.safeParse({ limit: '100' }).success).toBe(true);
    expect(listOutletsSchemas.query.safeParse({ limit: '101' }).success).toBe(false);
    expect(listOutletsSchemas.query.safeParse({ offset: '-1' }).success).toBe(false);
    expect(listOutletsSchemas.query.safeParse({ isActive: 'yes' }).success).toBe(false);
    const active = listOutletsSchemas.query.safeParse({ isActive: 'false' });
    expect(active.success && active.data.isActive).toBe(false);
  });

  it('defaults the top items limit to 5 and caps it at 50', () => {
    const parsed = topItemsSchemas.query.safeParse({});
    expect(parsed.success && parsed.data.limit).toBe(5);
    expect(topItemsSchemas.query.safeParse({ limit: '51' }).success).toBe(false);
    expect(topItemsSchemas.query.safeParse({ unknown: '1' }).success).toBe(false);
  });
});
