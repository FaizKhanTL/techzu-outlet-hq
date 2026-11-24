import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../src/modules/auth/auth.types';

// The service's database calls are replaced, so these tests check its decisions, not SQL.
vi.mock('../../src/db/transaction', () => ({
  withTransaction: (work: (client: unknown) => unknown) => work({}),
}));
vi.mock('../../src/modules/outlets/outlets.repository', () => ({ findOutletById: vi.fn() }));
vi.mock('../../src/modules/inventory/inventory.repository', () => ({
  lockStock: vi.fn(),
  applyStockDeltas: vi.fn(),
  insertMovements: vi.fn(),
}));
vi.mock('../../src/modules/sales/sales.repository', () => ({
  findOutletItems: vi.fn(),
  nextReceiptSeq: vi.fn(),
  insertSale: vi.fn(),
  insertSaleLines: vi.fn(),
  findSale: vi.fn(),
  findSaleByIdempotencyKey: vi.fn(),
}));

import * as outlets from '../../src/modules/outlets/outlets.repository';
import * as inventory from '../../src/modules/inventory/inventory.repository';
import * as sales from '../../src/modules/sales/sales.repository';
import { createSale } from '../../src/modules/sales/sales.service';
import { hashSaleRequest } from '../../src/modules/sales/sales.logic';

const OUTLET = '00000000-0000-4000-8000-0000000000aa';
const LATTE = '00000000-0000-4000-8000-000000000001';
const TEA = '00000000-0000-4000-8000-000000000002';
const staff: AuthContext = {
  userId: 'staff-1',
  email: 's@x.test',
  role: 'OUTLET_STAFF',
  outletId: OUTLET,
};
const outlet = {
  id: OUTLET,
  code: 'KLCC',
  name: 'KLCC',
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const menuItem = (id: string, priceCents: number, isSellable = true) => ({
  menuItemId: id,
  sku: id === LATTE ? 'COF-LATTE' : 'TEA',
  name: id === LATTE ? 'Latte' : 'Tea',
  priceCents,
  isSellable,
});
const input = (items: { menuItemId: string; quantity: number }[]) => ({
  items,
  paymentMethod: 'CASH' as const,
  note: null,
});
const caught = async (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

beforeEach(() => {
  vi.mocked(outlets.findOutletById).mockResolvedValue(outlet);
  vi.mocked(sales.findOutletItems).mockResolvedValue(
    new Map([
      [LATTE, menuItem(LATTE, 1300)],
      [TEA, menuItem(TEA, 600)],
    ]),
  );
  vi.mocked(inventory.lockStock).mockResolvedValue(
    new Map([
      [LATTE, 10],
      [TEA, 5],
    ]),
  );
  vi.mocked(inventory.applyStockDeltas).mockImplementation(async (_db, _outlet, deltas) => {
    const before = new Map([
      [LATTE, 10],
      [TEA, 5],
    ]);
    return new Map(deltas.map((d) => [d.menuItemId, before.get(d.menuItemId)! + d.delta]));
  });
  vi.mocked(sales.nextReceiptSeq).mockResolvedValue(42);
  vi.mocked(sales.insertSale).mockResolvedValue('sale-1');
  vi.mocked(sales.findSale).mockResolvedValue({ id: 'sale-1' } as never);
  vi.mocked(sales.findSaleByIdempotencyKey).mockResolvedValue(undefined);
});

describe('createSale', () => {
  it('prices from the outlet menu, totals, numbers the receipt and writes the ledger', async () => {
    const { sale, replayed } = await createSale(
      staff,
      OUTLET,
      input([
        { menuItemId: TEA, quantity: 2 },
        { menuItemId: LATTE, quantity: 1 },
        { menuItemId: TEA, quantity: 1 },
      ]),
    );
    expect(replayed).toBe(false);
    expect(sale).toMatchObject({ id: 'sale-1', currency: 'MYR' });

    expect(inventory.lockStock).toHaveBeenCalledWith({}, OUTLET, [LATTE, TEA]);
    expect(sales.insertSale).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        receiptSeq: 42,
        receiptNumber: 'KLCC-000042',
        totalCents: 1300 + 3 * 600,
        itemCount: 4,
        createdBy: 'staff-1',
        idempotencyKey: null,
        requestHash: null,
      }),
    );
    expect(sales.insertSaleLines).toHaveBeenCalledWith({}, 'sale-1', [
      {
        menuItemId: LATTE,
        sku: 'COF-LATTE',
        name: 'Latte',
        unitPriceCents: 1300,
        quantity: 1,
        lineTotalCents: 1300,
      },
      {
        menuItemId: TEA,
        sku: 'TEA',
        name: 'Tea',
        unitPriceCents: 600,
        quantity: 3,
        lineTotalCents: 1800,
      },
    ]);
    expect(inventory.insertMovements).toHaveBeenCalledWith({}, OUTLET, [
      expect.objectContaining({
        menuItemId: LATTE,
        quantityDelta: -1,
        quantityAfter: 9,
        reason: 'SALE',
        saleId: 'sale-1',
      }),
      expect.objectContaining({
        menuItemId: TEA,
        quantityDelta: -3,
        quantityAfter: 2,
        reason: 'SALE',
        saleId: 'sale-1',
      }),
    ]);
  });

  it('takes the receipt number only after the stock is deducted', async () => {
    await createSale(staff, OUTLET, input([{ menuItemId: LATTE, quantity: 1 }]));
    const deducted = vi.mocked(inventory.applyStockDeltas).mock.invocationCallOrder[0]!;
    const numbered = vi.mocked(sales.nextReceiptSeq).mock.invocationCallOrder[0]!;
    expect(deducted).toBeLessThan(numbered);
  });

  it('refuses items that are not on the menu or not sellable, before touching stock', async () => {
    vi.mocked(sales.findOutletItems).mockResolvedValue(
      new Map([[LATTE, menuItem(LATTE, 1300, false)]]),
    );
    const error = await caught(
      createSale(
        staff,
        OUTLET,
        input([
          { menuItemId: LATTE, quantity: 1 },
          { menuItemId: TEA, quantity: 1 },
        ]),
      ),
    );
    expect(error).toMatchObject({
      status: 422,
      code: 'ITEMS_NOT_SELLABLE',
      details: [
        { menuItemId: LATTE, reason: 'UNAVAILABLE' },
        { menuItemId: TEA, reason: 'NOT_ON_OUTLET_MENU' },
      ],
    });
    expect(inventory.lockStock).not.toHaveBeenCalled();
  });

  it('reports every short item and changes nothing', async () => {
    vi.mocked(inventory.lockStock).mockResolvedValue(new Map([[LATTE, 1]]));
    const error = await caught(
      createSale(
        staff,
        OUTLET,
        input([
          { menuItemId: LATTE, quantity: 2 },
          { menuItemId: TEA, quantity: 1 },
        ]),
      ),
    );
    expect(error).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: [
        { menuItemId: LATTE, sku: 'COF-LATTE', requested: 2, available: 1 },
        { menuItemId: TEA, sku: 'TEA', requested: 1, available: 0 },
      ],
    });
    expect(inventory.applyStockDeltas).not.toHaveBeenCalled();
    expect(sales.nextReceiptSeq).not.toHaveBeenCalled();
  });

  it('refuses a sale at an inactive or unknown outlet', async () => {
    vi.mocked(outlets.findOutletById).mockResolvedValueOnce({ ...outlet, isActive: false });
    expect(
      await caught(createSale(staff, OUTLET, input([{ menuItemId: LATTE, quantity: 1 }]))),
    ).toMatchObject({
      status: 422,
      code: 'OUTLET_INACTIVE',
    });
    vi.mocked(outlets.findOutletById).mockResolvedValueOnce(undefined);
    expect(
      await caught(createSale(staff, OUTLET, input([{ menuItemId: LATTE, quantity: 1 }]))),
    ).toMatchObject({ status: 404 });
  });

  it('stops rather than record a sale whose stock was not all deducted', async () => {
    vi.mocked(inventory.applyStockDeltas).mockResolvedValue(new Map([[LATTE, 9]]));
    const error = await caught(
      createSale(
        staff,
        OUTLET,
        input([
          { menuItemId: LATTE, quantity: 1 },
          { menuItemId: TEA, quantity: 1 },
        ]),
      ),
    );
    expect(error).toMatchObject({ status: 409, code: 'STOCK_CHANGED' });
    expect(sales.insertSale).not.toHaveBeenCalled();
  });

  describe('with an Idempotency-Key', () => {
    const lines = [{ menuItemId: LATTE, quantity: 1 }];
    const hash = hashSaleRequest(lines, { paymentMethod: 'CASH', note: null });

    it('returns the earlier sale for the same request without recording another', async () => {
      vi.mocked(sales.findSaleByIdempotencyKey).mockResolvedValue({
        id: 'old',
        receiptNumber: 'KLCC-000001',
        requestHash: hash,
      } as never);
      const result = await createSale(staff, OUTLET, input(lines), 'key-12345678');
      expect(result).toMatchObject({ replayed: true, sale: { id: 'old', currency: 'MYR' } });
      expect(result.sale).not.toHaveProperty('requestHash');
      expect(inventory.lockStock).not.toHaveBeenCalled();
    });

    it('refuses the key for a different request', async () => {
      vi.mocked(sales.findSaleByIdempotencyKey).mockResolvedValue({
        id: 'old',
        receiptNumber: 'KLCC-000001',
        requestHash: 'other',
      } as never);
      expect(await caught(createSale(staff, OUTLET, input(lines), 'key-12345678'))).toMatchObject({
        status: 409,
        code: 'IDEMPOTENCY_KEY_REUSED',
        details: { receiptNumber: 'KLCC-000001' },
      });
    });

    it('stores the key and the request fingerprint with a new sale', async () => {
      await createSale(staff, OUTLET, input(lines), 'key-12345678');
      expect(sales.insertSale).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ idempotencyKey: 'key-12345678', requestHash: hash }),
      );
    });

    it('answers a lost race on the key with the winning sale', async () => {
      vi.mocked(sales.findSaleByIdempotencyKey)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          id: 'winner',
          receiptNumber: 'KLCC-000007',
          requestHash: hash,
        } as never);
      vi.mocked(sales.insertSale).mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'sales_outlet_idempotency_key',
        }),
      );
      expect(await createSale(staff, OUTLET, input(lines), 'key-12345678')).toMatchObject({
        replayed: true,
        sale: { id: 'winner' },
      });
    });

    it('does not hide other unique violations', async () => {
      vi.mocked(sales.insertSale).mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'sales_receipt_number_key',
        }),
      );
      expect(await caught(createSale(staff, OUTLET, input(lines), 'key-12345678'))).toMatchObject({
        code: '23505',
      });
    });
  });
});
