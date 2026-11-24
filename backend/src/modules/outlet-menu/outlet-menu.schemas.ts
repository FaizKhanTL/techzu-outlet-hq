import { z } from 'zod';
import { booleanQuery, cents, uuid } from '../../lib/schemas';

export const assignmentParams = z.object({ outletId: uuid, menuItemId: uuid });

export const assignSchemas = {
  params: assignmentParams,
  body: z
    .object({
      // null (or leaving it out on a new assignment) sells at the master price.
      priceOverrideCents: cents.nullable().optional(),
      isAvailable: z.boolean().optional(),
    })
    .strict(),
};

export const updateAssignmentSchemas = {
  params: assignmentParams,
  body: z
    .object({
      priceOverrideCents: cents.nullable().optional(),
      isAvailable: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Send at least one field to change'),
};

export const unassignSchemas = { params: assignmentParams };

export const outletMenuSchemas = {
  params: z.object({ outletId: uuid }),
  // sellable=true: only what the till can sell right now (assigned, available, and active on the master menu).
  query: z.object({ sellable: booleanQuery.optional() }).strict(),
};
