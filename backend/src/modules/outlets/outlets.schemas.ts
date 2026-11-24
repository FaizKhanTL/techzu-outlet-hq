import { z } from 'zod';
import { booleanQuery, optionalText, paginationQuery, uuid } from '../../lib/schemas';

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9-]{1,15}$/,
    'Use 2-16 letters, digits or dashes, starting with a letter or digit',
  );
const name = z.string().trim().min(1).max(120);

export const outletIdParams = z.object({ outletId: uuid });

export const createOutletSchemas = {
  body: z.object({ code, name, address: optionalText(300) }).strict(),
};

export const updateOutletSchemas = {
  params: outletIdParams,
  body: z
    .object({
      name: name.optional(),
      address: optionalText(300).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change'),
};

export const getOutletSchemas = { params: outletIdParams };

export const listOutletsSchemas = {
  query: z
    .object({
      ...paginationQuery,
      search: z.string().trim().max(120).optional(),
      isActive: booleanQuery.optional(),
    })
    .strict(),
};
