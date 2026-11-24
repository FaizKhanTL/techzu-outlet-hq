import { pool } from '../../db/pool';
import { env } from '../../config/env';
import { ForbiddenError, NotFoundError } from '../../lib/errors';
import { findOutletById, listOutlets } from '../outlets/outlets.repository';
import type { AuthContext } from '../auth/auth.types';
import * as repo from './reports.repository';

export async function revenueByOutlet(range: { from?: string; to?: string }) {
  const outlets = await repo.revenueByOutlet(pool, range);
  return {
    currency: env.CURRENCY,
    from: range.from ?? null,
    to: range.to ?? null,
    totals: {
      saleCount: outlets.reduce((sum, row) => sum + row.saleCount, 0),
      itemsSold: outlets.reduce((sum, row) => sum + row.itemsSold, 0),
      revenueCents: outlets.reduce((sum, row) => sum + row.revenueCents, 0),
    },
    outlets,
  };
}

/** Top sellers per outlet. HQ may ask for one outlet or all; staff always get only their own outlet. */
export async function topItems(
  auth: AuthContext,
  filter: { from?: string; to?: string; outletId?: string; limit: number },
) {
  let outletId = filter.outletId;
  if (auth.role === 'OUTLET_STAFF') {
    if (outletId && outletId !== auth.outletId) {
      throw new ForbiddenError('You can only see reports for your own outlet.', 'OUTLET_FORBIDDEN');
    }
    outletId = auth.outletId!;
  }

  const outlets = outletId
    ? [await findOutletById(pool, outletId)].map((outlet) => {
        if (!outlet) throw new NotFoundError('Outlet');
        return outlet;
      })
    : (await listOutlets(pool, { limit: 10_000, offset: 0 })).items;

  const rows = await repo.topItems(pool, { ...filter, outletId });
  const byOutlet = new Map<string, Omit<repo.TopItemRow, 'outletId'>[]>();
  for (const { outletId: id, ...item } of rows) {
    byOutlet.set(id, [...(byOutlet.get(id) ?? []), item]);
  }
  return {
    currency: env.CURRENCY,
    from: filter.from ?? null,
    to: filter.to ?? null,
    limit: filter.limit,
    outlets: outlets.map((outlet) => ({
      outletId: outlet.id,
      outletCode: outlet.code,
      outletName: outlet.name,
      items: byOutlet.get(outlet.id) ?? [],
    })),
  };
}
