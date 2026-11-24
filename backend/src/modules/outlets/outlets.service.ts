import { pool } from '../../db/pool';
import { ConflictError, NotFoundError } from '../../lib/errors';
import * as repo from './outlets.repository';

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === '23505';

export async function createOutlet(input: { code: string; name: string; address: string | null }) {
  try {
    return await repo.insertOutlet(pool, input);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(
        `An outlet with code ${input.code} already exists.`,
        undefined,
        'OUTLET_CODE_TAKEN',
      );
    }
    throw error;
  }
}

export async function updateOutlet(
  id: string,
  patch: { name?: string; address?: string | null; isActive?: boolean },
) {
  const outlet = await repo.updateOutlet(pool, id, patch);
  if (!outlet) throw new NotFoundError('Outlet');
  return outlet;
}

export async function getOutlet(id: string) {
  const outlet = await repo.findOutletById(pool, id);
  if (!outlet) throw new NotFoundError('Outlet');
  return outlet;
}

export const listOutlets = (filter: Parameters<typeof repo.listOutlets>[1]) =>
  repo.listOutlets(pool, filter);
