import { pool } from '../../db/pool';
import { withTransaction } from '../../db/transaction';
import { ForbiddenError, NotFoundError, UnprocessableError } from '../../lib/errors';
import { findMenuItemById } from '../menu-items/menu-items.repository';
import { findOutletById } from '../outlets/outlets.repository';
import type { AuthContext } from '../auth/auth.types';
import * as repo from './outlet-menu.repository';

async function requireOutlet(outletId: string) {
  if (!(await findOutletById(pool, outletId))) throw new NotFoundError('Outlet');
}

export async function getOutletMenu(outletId: string, sellableOnly: boolean) {
  await requireOutlet(outletId);
  return repo.listOutletMenu(pool, outletId, sellableOnly);
}

/** HQ assigns an item to an outlet (or changes an existing assignment). */
export async function assign(
  outletId: string,
  menuItemId: string,
  input: { priceOverrideCents?: number | null; isAvailable?: boolean },
) {
  return withTransaction(async (client) => {
    if (!(await findOutletById(client, outletId))) throw new NotFoundError('Outlet');
    const item = await findMenuItemById(client, menuItemId);
    if (!item) throw new NotFoundError('Menu item');
    if (!item.isActive) {
      throw new UnprocessableError(
        'An inactive menu item cannot be assigned. Activate it first.',
        undefined,
        'MENU_ITEM_INACTIVE',
      );
    }
    const created = await repo.upsertAssignment(client, outletId, menuItemId, input);
    return { created, item: (await repo.findOutletMenuItem(client, outletId, menuItemId))! };
  });
}

/** HQ may change the price and availability; outlet staff may only pause or resume an item. */
export async function updateAssignment(
  auth: AuthContext,
  outletId: string,
  menuItemId: string,
  input: { priceOverrideCents?: number | null; isAvailable?: boolean },
) {
  if (auth.role !== 'HQ_ADMIN' && input.priceOverrideCents !== undefined) {
    throw new ForbiddenError('Only HQ can change an outlet price.', 'PRICE_CHANGE_FORBIDDEN');
  }
  const updated = await repo.updateAssignment(pool, outletId, menuItemId, input);
  if (!updated) throw new NotFoundError('Menu item assignment', 'NOT_ASSIGNED');
  return (await repo.findOutletMenuItem(pool, outletId, menuItemId))!;
}

/** Removes the item from the outlet's menu, with its stock row. Past sales keep their own copy of the item. */
export async function unassign(outletId: string, menuItemId: string) {
  const deleted = await repo.deleteAssignment(pool, outletId, menuItemId);
  if (!deleted) throw new NotFoundError('Menu item assignment', 'NOT_ASSIGNED');
}
