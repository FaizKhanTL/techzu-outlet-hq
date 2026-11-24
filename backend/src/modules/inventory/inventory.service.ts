import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { findOutletById } from '../outlets/outlets.repository';
import type { AuthContext } from '../auth/auth.types';
import * as repo from './inventory.repository';

export async function listInventory(outletId: string) {
  if (!(await findOutletById(pool, outletId))) throw new NotFoundError('Outlet');
  return repo.listInventory(pool, outletId);
}

/** A manual stock change (restock, waste, correction), recorded in the ledger. Stock never goes below zero. */
export async function adjustStock(
  auth: AuthContext,
  outletId: string,
  menuItemId: string,
  input: { quantityDelta: number; reason: 'RESTOCK' | 'WASTE' | 'CORRECTION'; note: string | null },
) {
  return withTransaction(async (client) => {
    const current = (await repo.lockStock(client, outletId, [menuItemId])).get(menuItemId);
    if (current === undefined) {
      throw new NotFoundError('Menu item on this outlet', 'NOT_ASSIGNED');
    }
    if (current + input.quantityDelta < 0) {
      throw new ConflictError(
        `Only ${current} in stock; cannot remove ${-input.quantityDelta}.`,
        { menuItemId, available: current, requested: -input.quantityDelta },
        'INSUFFICIENT_STOCK',
      );
    }
    const after = (
      await repo.applyStockDeltas(client, outletId, [{ menuItemId, delta: input.quantityDelta }])
    ).get(menuItemId)!;
    const [movement] = await repo.insertMovements(client, outletId, [
      {
        menuItemId,
        quantityDelta: input.quantityDelta,
        quantityAfter: after,
        reason: input.reason,
        saleId: null,
        note: input.note,
        createdBy: auth.userId,
      },
    ]);
    return { menuItemId, quantity: after, movement };
  });
}

export async function listMovements(
  outletId: string,
  menuItemId: string,
  limit: number,
  offset: number,
) {
  return repo.listMovements(pool, outletId, menuItemId, limit, offset);
}
