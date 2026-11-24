import { z } from 'zod';
import { optionalText, paginationQuery, uuid } from '../../lib/schemas';

export const ADJUSTMENT_REASONS = ['RESTOCK', 'WASTE', 'CORRECTION'] as const;

export const listInventorySchemas = { params: z.object({ outletId: uuid }) };

export const adjustStockSchemas = {
  params: z.object({ outletId: uuid, menuItemId: uuid }),
  body: z
    .object({
      quantityDelta: z
        .number()
        .int()
        .min(-100_000)
        .max(100_000)
        .refine((value) => value !== 0, 'quantityDelta cannot be 0'),
      reason: z.enum(ADJUSTMENT_REASONS),
      note: optionalText(300),
    })
    .strict()
    .superRefine((body, ctx) => {
      if (body.reason === 'RESTOCK' && body.quantityDelta < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityDelta'],
          message: 'A restock adds stock (> 0)',
        });
      }
      if (body.reason === 'WASTE' && body.quantityDelta > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantityDelta'],
          message: 'Waste removes stock (< 0)',
        });
      }
    }),
};

export const listMovementsSchemas = {
  params: z.object({ outletId: uuid, menuItemId: uuid }),
  query: z.object({ ...paginationQuery }).strict(),
};
