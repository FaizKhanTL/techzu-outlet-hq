import { z } from './zod';

/**
 * What the API sends back, as zod schemas: the OpenAPI document is generated from them, and the contract tests parse
 * real responses with them. Objects are strict, so a field the API adds without documenting it fails a test.
 */

const uuid = z.string().uuid();
const timestamp = z.string().datetime().openapi({ example: '2026-11-24T10:15:00.000Z' });
const cents = z.number().int().min(0).openapi({ description: 'Integer minor units of `currency`' });
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .openapi({ description: 'ISO 4217 code of every `*Cents` value', example: 'MYR' });

export const ErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
        message: z.string().openapi({ example: 'The request is not valid.' }),
        details: z
          .unknown()
          .optional()
          .openapi({
            description:
              'Present for some codes: the invalid fields (VALIDATION_ERROR), the short items (INSUFFICIENT_STOCK), ' +
              'the items that cannot be sold (ITEMS_NOT_SELLABLE).',
          }),
        requestId: z
          .string()
          .openapi({ description: 'Also in the X-Request-Id header and the API logs' }),
      })
      .strict(),
  })
  .strict()
  .openapi('Error');

export const PageMetaSchema = z
  .object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int().openapi({ description: 'Rows matching the filter, across all pages' }),
  })
  .strict()
  .openapi('PageMeta');

export const RoleSchema = z.enum(['HQ_ADMIN', 'OUTLET_STAFF']).openapi('Role');

export const UserSchema = z
  .object({
    id: uuid,
    email: z.string().email(),
    fullName: z.string(),
    role: RoleSchema,
    outletId: uuid.nullable().openapi({ description: 'The staff member’s outlet; null for HQ' }),
    currency,
  })
  .strict()
  .openapi('User');

export const LoginResultSchema = z
  .object({
    token: z.string().openapi({ description: 'Send as `Authorization: Bearer <token>`' }),
    expiresIn: z.string().openapi({ example: '8h' }),
    tokenType: z.literal('Bearer'),
    user: UserSchema,
  })
  .strict()
  .openapi('LoginResult');

export const OutletSchema = z
  .object({
    id: uuid,
    code: z
      .string()
      .openapi({ example: 'KLCC', description: 'Printed on receipts; cannot change' }),
    name: z.string().openapi({ example: 'KLCC Flagship' }),
    address: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .openapi('Outlet');

export const MenuItemSchema = z
  .object({
    id: uuid,
    sku: z.string().openapi({ example: 'COF-LATTE' }),
    name: z.string().openapi({ example: 'Cafe Latte' }),
    description: z.string().nullable(),
    category: z.string().openapi({ example: 'Coffee' }),
    basePriceCents: cents,
    isActive: z.boolean(),
    assignedOutletCount: z.number().int().min(0),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict()
  .openapi('MenuItem');

export const OutletMenuItemSchema = z
  .object({
    outletId: uuid,
    menuItemId: uuid,
    sku: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    category: z.string(),
    basePriceCents: cents,
    priceOverrideCents: cents
      .nullable()
      .openapi({ description: 'The outlet’s own price; null uses the master price' }),
    priceCents: cents.openapi({
      description: 'What this outlet charges: the override, or the master price',
    }),
    isAvailable: z.boolean().openapi({ description: 'False while the outlet has paused the item' }),
    menuItemIsActive: z.boolean(),
    isSellable: z
      .boolean()
      .openapi({ description: 'Available here and active on the master menu' }),
    stockQuantity: z.number().int().min(0),
    updatedAt: timestamp,
  })
  .strict()
  .openapi('OutletMenuItem');

export const InventoryLineSchema = z
  .object({
    menuItemId: uuid,
    sku: z.string(),
    name: z.string(),
    category: z.string(),
    quantity: z.number().int().min(0),
    isAvailable: z.boolean(),
    updatedAt: timestamp,
  })
  .strict()
  .openapi('InventoryLine');

export const MovementSchema = z
  .object({
    id: uuid,
    menuItemId: uuid,
    quantityDelta: z.number().int(),
    quantityAfter: z.number().int().min(0),
    reason: z.enum(['RESTOCK', 'SALE', 'WASTE', 'CORRECTION']),
    saleId: uuid.nullable().openapi({ description: 'The sale that caused it, for SALE movements' }),
    note: z.string().nullable(),
    createdBy: uuid.nullable(),
    createdAt: timestamp,
  })
  .strict()
  .openapi('StockMovement');

export const StockAdjustmentSchema = z
  .object({
    menuItemId: uuid,
    quantity: z.number().int().min(0).openapi({ description: 'Stock after the change' }),
    movement: MovementSchema,
  })
  .strict()
  .openapi('StockAdjustment');

export const SaleLineSchema = z
  .object({
    menuItemId: uuid,
    sku: z.string(),
    name: z.string(),
    unitPriceCents: cents.openapi({ description: 'The outlet price at the time of the sale' }),
    quantity: z.number().int().min(1),
    lineTotalCents: cents,
  })
  .strict()
  .openapi('SaleLine');

export const SaleSchema = z
  .object({
    id: uuid,
    outletId: uuid,
    receiptSeq: z
      .number()
      .int()
      .min(1)
      .openapi({ description: 'Sequential and gap-free per outlet' }),
    receiptNumber: z.string().openapi({ example: 'KLCC-000012' }),
    totalCents: cents,
    itemCount: z.number().int().min(1),
    paymentMethod: z.enum(['CASH', 'CARD', 'E_WALLET']),
    note: z.string().nullable(),
    createdBy: uuid.nullable(),
    createdAt: timestamp,
    items: z.array(SaleLineSchema),
    currency,
  })
  .strict()
  .openapi('Sale');

const range = {
  from: timestamp.nullable().openapi({ description: 'The `from` asked for (inclusive), or null' }),
  to: timestamp.nullable().openapi({ description: 'The `to` asked for (exclusive), or null' }),
};

export const RevenueReportSchema = z
  .object({
    currency,
    ...range,
    totals: z
      .object({ saleCount: z.number().int(), itemsSold: z.number().int(), revenueCents: cents })
      .strict(),
    outlets: z.array(
      z
        .object({
          outletId: uuid,
          outletCode: z.string(),
          outletName: z.string(),
          outletIsActive: z.boolean(),
          saleCount: z.number().int(),
          itemsSold: z.number().int(),
          revenueCents: cents,
        })
        .strict(),
    ),
  })
  .strict()
  .openapi('RevenueReport');

export const TopItemsReportSchema = z
  .object({
    currency,
    ...range,
    limit: z.number().int(),
    outlets: z.array(
      z
        .object({
          outletId: uuid,
          outletCode: z.string(),
          outletName: z.string(),
          items: z.array(
            z
              .object({
                rank: z.number().int().min(1),
                menuItemId: uuid,
                sku: z.string(),
                name: z.string(),
                quantitySold: z.number().int(),
                revenueCents: cents,
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi('TopItemsReport');

export const HealthSchema = z.object({ status: z.enum(['ok']) }).strict();
export const ReadySchema = z.object({ status: z.enum(['ready', 'unavailable']) }).strict();

/** `{ data: T }` */
export const dataOf = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema }).strict();

/** `{ data: T[], meta }` */
export const pageOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: z.array(schema), meta: PageMetaSchema }).strict();
