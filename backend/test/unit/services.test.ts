import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../src/modules/auth/auth.types';

vi.mock('../../src/db/transaction', () => ({
  withTransaction: (work: (client: unknown) => unknown) => work({}),
}));
vi.mock('../../src/modules/outlets/outlets.repository', () => ({
  findOutletById: vi.fn(),
  listOutlets: vi.fn(),
}));
vi.mock('../../src/modules/menu-items/menu-items.repository', () => ({
  findMenuItemById: vi.fn(),
}));
vi.mock('../../src/modules/outlet-menu/outlet-menu.repository', () => ({
  upsertAssignment: vi.fn(),
  updateAssignment: vi.fn(),
  deleteAssignment: vi.fn(),
  findOutletMenuItem: vi.fn(),
  listOutletMenu: vi.fn(),
}));
vi.mock('../../src/modules/inventory/inventory.repository', () => ({
  lockStock: vi.fn(),
  applyStockDeltas: vi.fn(),
  insertMovements: vi.fn(),
}));
vi.mock('../../src/modules/reports/reports.repository', () => ({
  revenueByOutlet: vi.fn(),
  topItems: vi.fn(),
}));

import * as outletsRepo from '../../src/modules/outlets/outlets.repository';
import * as menuRepo from '../../src/modules/menu-items/menu-items.repository';
import * as outletMenuRepo from '../../src/modules/outlet-menu/outlet-menu.repository';
import * as inventoryRepo from '../../src/modules/inventory/inventory.repository';
import * as reportsRepo from '../../src/modules/reports/reports.repository';
import * as outletMenu from '../../src/modules/outlet-menu/outlet-menu.service';
import * as inventory from '../../src/modules/inventory/inventory.service';
import * as reports from '../../src/modules/reports/reports.service';

const A = '00000000-0000-4000-8000-0000000000aa';
const B = '00000000-0000-4000-8000-0000000000bb';
const ITEM = '00000000-0000-4000-8000-000000000001';
const hq: AuthContext = { userId: 'hq', email: 'hq@x.test', role: 'HQ_ADMIN', outletId: null };
const staffA: AuthContext = { userId: 'sa', email: 'a@x.test', role: 'OUTLET_STAFF', outletId: A };
const outlet = (id: string, code: string) => ({
  id,
  code,
  name: code,
  address: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const caught = async (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => error,
  );

beforeEach(() => {
  vi.mocked(outletsRepo.findOutletById).mockImplementation(async (_db, id) =>
    id === A ? outlet(A, 'AAA') : id === B ? outlet(B, 'BBB') : undefined,
  );
});

describe('outlet menu service', () => {
  it('will not assign an inactive item, or one that does not exist', async () => {
    vi.mocked(menuRepo.findMenuItemById).mockResolvedValueOnce({
      id: ITEM,
      isActive: false,
    } as never);
    expect(await caught(outletMenu.assign(A, ITEM, {}))).toMatchObject({
      status: 422,
      code: 'MENU_ITEM_INACTIVE',
    });
    vi.mocked(menuRepo.findMenuItemById).mockResolvedValueOnce(undefined);
    expect(await caught(outletMenu.assign(A, ITEM, {}))).toMatchObject({ status: 404 });
    expect(outletMenuRepo.upsertAssignment).not.toHaveBeenCalled();
  });

  it('tells a new assignment from an update', async () => {
    vi.mocked(menuRepo.findMenuItemById).mockResolvedValue({ id: ITEM, isActive: true } as never);
    vi.mocked(outletMenuRepo.upsertAssignment).mockResolvedValueOnce(true);
    vi.mocked(outletMenuRepo.findOutletMenuItem).mockResolvedValue({ menuItemId: ITEM } as never);
    expect(await outletMenu.assign(A, ITEM, { priceOverrideCents: 900 })).toMatchObject({
      created: true,
    });
    expect(outletMenuRepo.upsertAssignment).toHaveBeenCalledWith({}, A, ITEM, {
      priceOverrideCents: 900,
    });
  });

  it('stops staff from changing a price before asking the database', async () => {
    expect(
      await caught(outletMenu.updateAssignment(staffA, A, ITEM, { priceOverrideCents: 1 })),
    ).toMatchObject({
      status: 403,
      code: 'PRICE_CHANGE_FORBIDDEN',
    });
    expect(outletMenuRepo.updateAssignment).not.toHaveBeenCalled();
  });

  it('answers NOT_ASSIGNED when there is nothing to update or remove', async () => {
    vi.mocked(outletMenuRepo.updateAssignment).mockResolvedValueOnce(false);
    expect(
      await caught(outletMenu.updateAssignment(staffA, A, ITEM, { isAvailable: false })),
    ).toMatchObject({ code: 'NOT_ASSIGNED' });
    vi.mocked(outletMenuRepo.deleteAssignment).mockResolvedValueOnce(false);
    expect(await caught(outletMenu.unassign(A, ITEM))).toMatchObject({ code: 'NOT_ASSIGNED' });
  });
});

describe('inventory service', () => {
  it('refuses to take stock below zero and says how much there is', async () => {
    vi.mocked(inventoryRepo.lockStock).mockResolvedValue(new Map([[ITEM, 3]]));
    expect(
      await caught(
        inventory.adjustStock(staffA, A, ITEM, { quantityDelta: -4, reason: 'WASTE', note: null }),
      ),
    ).toMatchObject({
      status: 409,
      code: 'INSUFFICIENT_STOCK',
      details: { menuItemId: ITEM, available: 3, requested: 4 },
    });
    expect(inventoryRepo.applyStockDeltas).not.toHaveBeenCalled();
  });

  it('answers NOT_ASSIGNED for an item without a stock row', async () => {
    vi.mocked(inventoryRepo.lockStock).mockResolvedValue(new Map());
    expect(
      await caught(
        inventory.adjustStock(staffA, A, ITEM, { quantityDelta: 1, reason: 'RESTOCK', note: null }),
      ),
    ).toMatchObject({
      status: 404,
      code: 'NOT_ASSIGNED',
    });
  });

  it('records who changed the stock, why, and the stock after it', async () => {
    vi.mocked(inventoryRepo.lockStock).mockResolvedValue(new Map([[ITEM, 3]]));
    vi.mocked(inventoryRepo.applyStockDeltas).mockResolvedValue(new Map([[ITEM, 8]]));
    vi.mocked(inventoryRepo.insertMovements).mockResolvedValue([{ id: 'm1' }] as never);
    expect(
      await inventory.adjustStock(staffA, A, ITEM, {
        quantityDelta: 5,
        reason: 'RESTOCK',
        note: 'Delivery',
      }),
    ).toMatchObject({
      quantity: 8,
      movement: { id: 'm1' },
    });
    expect(inventoryRepo.insertMovements).toHaveBeenCalledWith({}, A, [
      {
        menuItemId: ITEM,
        quantityDelta: 5,
        quantityAfter: 8,
        reason: 'RESTOCK',
        saleId: null,
        note: 'Delivery',
        createdBy: 'sa',
      },
    ]);
  });
});

describe('reports service', () => {
  it('adds up the totals across outlets', async () => {
    vi.mocked(reportsRepo.revenueByOutlet).mockResolvedValue([
      { outletId: A, saleCount: 2, itemsSold: 5, revenueCents: 1500 },
      { outletId: B, saleCount: 0, itemsSold: 0, revenueCents: 0 },
    ] as never);
    expect(await reports.revenueByOutlet({})).toMatchObject({
      currency: 'SGD',
      from: null,
      to: null,
      totals: { saleCount: 2, itemsSold: 5, revenueCents: 1500 },
    });
  });

  it('gives staff their own outlet even when they ask for none, and refuses another', async () => {
    vi.mocked(reportsRepo.topItems).mockResolvedValue([]);
    const own = await reports.topItems(staffA, { limit: 5 });
    expect(reportsRepo.topItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outletId: A }),
    );
    expect(own.outlets.map((o) => o.outletId)).toEqual([A]);
    expect(await caught(reports.topItems(staffA, { limit: 5, outletId: B }))).toMatchObject({
      status: 403,
      code: 'OUTLET_FORBIDDEN',
    });
  });

  it('groups ranked rows by outlet and lists outlets without sales as empty', async () => {
    vi.mocked(outletsRepo.listOutlets).mockResolvedValue({
      items: [outlet(A, 'AAA'), outlet(B, 'BBB')],
      total: 2,
    });
    vi.mocked(reportsRepo.topItems).mockResolvedValue([
      {
        outletId: A,
        rank: 1,
        menuItemId: ITEM,
        sku: 'X',
        name: 'X',
        quantitySold: 3,
        revenueCents: 300,
      },
    ]);
    const result = await reports.topItems(hq, { limit: 5 });
    expect(result.outlets).toEqual([
      {
        outletId: A,
        outletCode: 'AAA',
        outletName: 'AAA',
        items: [
          { rank: 1, menuItemId: ITEM, sku: 'X', name: 'X', quantitySold: 3, revenueCents: 300 },
        ],
      },
      { outletId: B, outletCode: 'BBB', outletName: 'BBB', items: [] },
    ]);
  });

  it('answers 404 for an unknown outlet', async () => {
    expect(
      await caught(
        reports.topItems(hq, { limit: 5, outletId: '00000000-0000-4000-8000-0000000000cc' }),
      ),
    ).toMatchObject({ status: 404 });
  });
});
