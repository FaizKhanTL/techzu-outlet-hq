import { z } from 'zod';
import {
  dateRangeQuery,
  optionalText,
  paginationQuery,
  refineDateRange,
  uuid,
} from '../../lib/schemas';

export const PAYMENT_METHODS = ['CASH', 'CARD', 'E_WALLET'] as const;
export const MAX_LINE_QUANTITY = 999;

/** A client-chosen key per sale attempt (a UUID is ideal); the same key retried returns the same sale. */
export const idempotencyKeySchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_-]{8,128}$/,
    'Idempotency-Key must be 8-128 letters, digits, dashes or underscores',
  );

export const createSaleSchemas = {
  params: z.object({ outletId: uuid }),
  body: z
    .object({
      items: z
        .array(
          z
            .object({ menuItemId: uuid, quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY) })
            .strict(),
        )
        .min(1, 'A sale needs at least one item')
        .max(50),
      paymentMethod: z.enum(PAYMENT_METHODS),
      note: optionalText(300),
    })
    .strict(),
};

export const getSaleSchemas = { params: z.object({ outletId: uuid, saleId: uuid }) };

export const listSalesSchemas = {
  params: z.object({ outletId: uuid }),
  query: z
    .object({ ...paginationQuery, ...dateRangeQuery })
    .strict()
    .superRefine(refineDateRange),
};
