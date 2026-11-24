import { z } from 'zod';
import { dateRangeQuery, refineDateRange, uuid } from '../../lib/schemas';

export const revenueByOutletSchemas = {
  query: z
    .object({ ...dateRangeQuery })
    .strict()
    .superRefine(refineDateRange),
};

export const topItemsSchemas = {
  query: z
    .object({
      ...dateRangeQuery,
      // Leave it out for every outlet (HQ); outlet staff always get their own.
      outletId: uuid.optional(),
      limit: z.coerce.number().int().min(1).max(50).default(5),
    })
    .strict()
    .superRefine(refineDateRange),
};
