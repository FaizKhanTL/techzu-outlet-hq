import { z } from 'zod';
import { booleanQuery, cents, optionalText, paginationQuery, uuid } from '../../lib/schemas';

const sku = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, 'Use 2-32 letters, digits, dashes or underscores');
const name = z.string().trim().min(1).max(120);
const category = z.string().trim().min(1).max(60);

export const menuItemIdParams = z.object({ menuItemId: uuid });

export const createMenuItemSchemas = {
  body: z
    .object({
      sku,
      name,
      description: optionalText(500),
      category: category.default('General'),
      basePriceCents: cents,
    })
    .strict(),
};

export const updateMenuItemSchemas = {
  params: menuItemIdParams,
  body: z
    .object({
      name: name.optional(),
      description: optionalText(500).optional(),
      category: category.optional(),
      basePriceCents: cents.optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change'),
};

export const getMenuItemSchemas = { params: menuItemIdParams };

export const listMenuItemsSchemas = {
  query: z
    .object({
      ...paginationQuery,
      search: z.string().trim().max(120).optional(),
      category: category.optional(),
      isActive: booleanQuery.optional(),
    })
    .strict(),
};
