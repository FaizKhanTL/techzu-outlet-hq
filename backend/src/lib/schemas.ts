import { z } from 'zod';

export const uuid = z.string().uuid();

/** Money in minor units. The upper bound keeps every total far inside a safe integer. */
export const cents = z.number().int().min(0).max(100_000_000);

export const paginationQuery = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
};

const isoDateTime = z.string().datetime({ offset: true });

/** `from` inclusive, `to` exclusive, as ISO 8601 with a time zone. Both optional. */
export const dateRangeQuery = {
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
};

export const refineDateRange = <T extends { from?: string; to?: string }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.from && value.to && new Date(value.from) >= new Date(value.to)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['to'],
      message: '"to" must be after "from"',
    });
  }
};

export const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

/** A trimmed, optional text field: blank becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));
