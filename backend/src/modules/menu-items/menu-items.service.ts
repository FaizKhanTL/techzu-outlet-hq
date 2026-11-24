import { pool } from '../../db/pool';
import { ConflictError, NotFoundError } from '../../lib/errors';
import * as repo from './menu-items.repository';

export async function createMenuItem(input: Parameters<typeof repo.insertMenuItem>[1]) {
  try {
    return await repo.insertMenuItem(pool, input);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ConflictError(
        `A menu item with SKU ${input.sku} already exists.`,
        undefined,
        'SKU_TAKEN',
      );
    }
    throw error;
  }
}

export async function updateMenuItem(id: string, patch: Parameters<typeof repo.updateMenuItem>[2]) {
  const item = await repo.updateMenuItem(pool, id, patch);
  if (!item) throw new NotFoundError('Menu item');
  return item;
}

export async function getMenuItem(id: string) {
  const item = await repo.findMenuItemById(pool, id);
  if (!item) throw new NotFoundError('Menu item');
  return item;
}

export const listMenuItems = (filter: Parameters<typeof repo.listMenuItems>[1]) =>
  repo.listMenuItems(pool, filter);
