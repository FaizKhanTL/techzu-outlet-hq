import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type ResponseConfig,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from './zod';
import { env } from '../config/env';
import { loginSchemas } from '../modules/auth/auth.schemas';
import {
  createOutletSchemas,
  getOutletSchemas,
  listOutletsSchemas,
  updateOutletSchemas,
} from '../modules/outlets/outlets.schemas';
import {
  createMenuItemSchemas,
  getMenuItemSchemas,
  listMenuItemsSchemas,
  updateMenuItemSchemas,
} from '../modules/menu-items/menu-items.schemas';
import {
  assignSchemas,
  outletMenuSchemas,
  unassignSchemas,
  updateAssignmentSchemas,
} from '../modules/outlet-menu/outlet-menu.schemas';
import {
  adjustStockSchemas,
  listInventorySchemas,
  listMovementsSchemas,
} from '../modules/inventory/inventory.schemas';
import {
  createSaleSchemas,
  getSaleSchemas,
  idempotencyKeySchema,
  listSalesSchemas,
} from '../modules/sales/sales.schemas';
import { revenueByOutletSchemas, topItemsSchemas } from '../modules/reports/reports.schemas';
import {
  ErrorSchema,
  HealthSchema,
  InventoryLineSchema,
  LoginResultSchema,
  MenuItemSchema,
  MovementSchema,
  OutletMenuItemSchema,
  OutletSchema,
  ReadySchema,
  RevenueReportSchema,
  SaleSchema,
  StockAdjustmentSchema,
  TopItemsReportSchema,
  UserSchema,
  dataOf,
  pageOf,
} from './schemas';

/** The API's base path; every operation below is relative to it unless it says otherwise. */
export const API_BASE = '/api/v1';

/** One documented response: what it means and, when it has a body, the schema that body follows. */
export interface DocumentedResponse {
  description: string;
  schema?: z.ZodTypeAny;
  headers?: ResponseConfig['headers'];
}

/** Who may call an operation. */
type Access = 'public' | 'signedIn' | 'hq' | 'outlet';

export interface Operation {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** OpenAPI style (`{outletId}`), relative to `API_BASE` (or to `/` for `root` operations). */
  path: string;
  root?: boolean;
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  access: Access;
  request?: RouteConfig['request'];
  responses: Record<number, DocumentedResponse>;
}

const requestIdHeader = {
  'X-Request-Id': {
    description: 'Identifies the request in the API logs (sent back as received, or generated)',
    schema: { type: 'string' as const },
  },
};

const error = (description: string): DocumentedResponse => ({ description, schema: ErrorSchema });

/** A JSON request body. The example is typed by the schema, so an example that no longer fits fails to compile. */
const json = <T extends z.ZodTypeAny>(schema: T, example?: z.input<T>) => ({
  content: { 'application/json': { schema, ...(example === undefined ? {} : { example }) } },
});

const VALIDATION = error(
  '`VALIDATION_ERROR`: `details` lists each invalid field (`body.items.0.quantity`, `query.limit`, ...). ' +
    '`INVALID_JSON` for a body that is not JSON.',
);

/** The responses every operation of an access level can give, before its own. */
function accessResponses(access: Access): Record<number, DocumentedResponse> {
  if (access === 'public') return {};
  const unauthorized = error(
    '`TOKEN_REQUIRED` (no bearer token), `INVALID_TOKEN` (bad or expired), `ACCOUNT_DISABLED` (user or outlet ' +
      'deactivated since sign-in).',
  );
  if (access === 'signedIn') return { 401: unauthorized };
  return {
    401: unauthorized,
    403: error(
      access === 'hq'
        ? '`ROLE_FORBIDDEN`: HQ admins only.'
        : '`OUTLET_FORBIDDEN`: outlet staff may only use their own outlet.',
    ),
  };
}

const ACCESS_NOTE: Record<Access, string> = {
  public: 'No token needed.',
  signedIn: 'Any signed-in user.',
  hq: 'HQ admins only.',
  outlet: 'HQ admins, and the staff of this outlet.',
};

const outletNotFound = error('`NOT_FOUND`: no outlet with this id.');

export const operations: Operation[] = [
  // ---------------------------------------------------------------- Auth
  {
    method: 'post',
    path: '/auth/login',
    operationId: 'login',
    tag: 'Auth',
    summary: 'Sign in',
    description:
      'Returns a bearer token for the other endpoints. An unknown email and a wrong password give the same answer. ' +
      'Limited per client address (`RateLimit` and `RateLimit-Policy` headers).',
    access: 'public',
    request: {
      body: json(loginSchemas.body, { email: 'hq@example.com', password: 'Password123!' }),
    },
    responses: {
      200: { description: 'Signed in', schema: dataOf(LoginResultSchema) },
      400: VALIDATION,
      401: error(
        '`INVALID_CREDENTIALS`: email or password is incorrect, or the account is disabled.',
      ),
      429: error('`RATE_LIMITED`: too many sign-in attempts from this address; wait a minute.'),
    },
  },
  {
    method: 'get',
    path: '/auth/me',
    operationId: 'getCurrentUser',
    tag: 'Auth',
    summary: 'The signed-in user',
    access: 'signedIn',
    responses: { 200: { description: 'The user behind the token', schema: dataOf(UserSchema) } },
  },

  // ---------------------------------------------------------------- Outlets
  {
    method: 'get',
    path: '/outlets',
    operationId: 'listOutlets',
    tag: 'Outlets',
    summary: 'List outlets',
    description: 'Ordered by code. `search` matches the code or the name.',
    access: 'hq',
    request: { query: listOutletsSchemas.query },
    responses: {
      200: { description: 'A page of outlets', schema: pageOf(OutletSchema) },
      400: VALIDATION,
    },
  },
  {
    method: 'post',
    path: '/outlets',
    operationId: 'createOutlet',
    tag: 'Outlets',
    summary: 'Create an outlet',
    description: 'The code is upper-cased, printed on receipts and cannot be changed later.',
    access: 'hq',
    request: {
      body: json(createOutletSchemas.body, {
        code: 'JEWEL',
        name: 'Jewel Changi',
        address: '78 Airport Boulevard, #B1-201, Singapore 819666',
      }),
    },
    responses: {
      201: { description: 'Created', schema: dataOf(OutletSchema) },
      400: VALIDATION,
      409: error('`OUTLET_CODE_TAKEN`: another outlet has this code.'),
    },
  },
  {
    method: 'get',
    path: '/outlets/{outletId}',
    operationId: 'getOutlet',
    tag: 'Outlets',
    summary: 'Get an outlet',
    access: 'outlet',
    request: { params: getOutletSchemas.params },
    responses: {
      200: { description: 'The outlet', schema: dataOf(OutletSchema) },
      400: VALIDATION,
      404: outletNotFound,
    },
  },
  {
    method: 'patch',
    path: '/outlets/{outletId}',
    operationId: 'updateOutlet',
    tag: 'Outlets',
    summary: 'Update or deactivate an outlet',
    description:
      'Send only what changes. A deactivated outlet cannot sell, and its staff can no longer sign in.',
    access: 'hq',
    request: {
      params: updateOutletSchemas.params,
      body: json(updateOutletSchemas.body, { name: 'Orchard Flagship', isActive: true }),
    },
    responses: {
      200: { description: 'Updated', schema: dataOf(OutletSchema) },
      400: VALIDATION,
      404: outletNotFound,
    },
  },

  // ---------------------------------------------------------------- Master menu
  {
    method: 'get',
    path: '/menu-items',
    operationId: 'listMenuItems',
    tag: 'Master menu',
    summary: 'List the master menu',
    description: 'Ordered by category and name. `search` matches the SKU or the name.',
    access: 'hq',
    request: { query: listMenuItemsSchemas.query },
    responses: {
      200: { description: 'A page of menu items', schema: pageOf(MenuItemSchema) },
      400: VALIDATION,
    },
  },
  {
    method: 'post',
    path: '/menu-items',
    operationId: 'createMenuItem',
    tag: 'Master menu',
    summary: 'Create a menu item',
    description: 'The SKU is upper-cased and cannot be changed later.',
    access: 'hq',
    request: {
      body: json(createMenuItemSchemas.body, {
        sku: 'COF-MOCHA',
        name: 'Mocha',
        category: 'Coffee',
        description: 'Espresso, chocolate and steamed milk',
        basePriceCents: 720,
      }),
    },
    responses: {
      201: { description: 'Created', schema: dataOf(MenuItemSchema) },
      400: VALIDATION,
      409: error('`SKU_TAKEN`: another menu item has this SKU.'),
    },
  },
  {
    method: 'get',
    path: '/menu-items/{menuItemId}',
    operationId: 'getMenuItem',
    tag: 'Master menu',
    summary: 'Get a menu item',
    access: 'hq',
    request: { params: getMenuItemSchemas.params },
    responses: {
      200: {
        description: 'The menu item, with how many outlets sell it',
        schema: dataOf(MenuItemSchema),
      },
      400: VALIDATION,
      404: error('`NOT_FOUND`: no menu item with this id.'),
    },
  },
  {
    method: 'patch',
    path: '/menu-items/{menuItemId}',
    operationId: 'updateMenuItem',
    tag: 'Master menu',
    summary: 'Update or retire a menu item',
    description:
      'Send only what changes. A new base price applies to future sales at outlets without their own price; past ' +
      'receipts keep theirs. `isActive: false` stops every outlet from selling it.',
    access: 'hq',
    request: {
      params: updateMenuItemSchemas.params,
      body: json(updateMenuItemSchemas.body, { basePriceCents: 680 }),
    },
    responses: {
      200: { description: 'Updated', schema: dataOf(MenuItemSchema) },
      400: VALIDATION,
      404: error('`NOT_FOUND`: no menu item with this id.'),
    },
  },

  // ---------------------------------------------------------------- Outlet menu
  {
    method: 'get',
    path: '/outlets/{outletId}/menu-items',
    operationId: 'getOutletMenu',
    tag: 'Outlet menu',
    summary: 'The outlet’s menu',
    description:
      'Only the items assigned to this outlet, at this outlet’s prices, with stock. `sellable=true` returns just ' +
      'what the till can sell now (available here and active on the master menu).',
    access: 'outlet',
    request: { params: outletMenuSchemas.params, query: outletMenuSchemas.query },
    responses: {
      200: { description: 'The assigned items', schema: dataOf(z.array(OutletMenuItemSchema)) },
      400: VALIDATION,
      404: outletNotFound,
    },
  },
  {
    method: 'put',
    path: '/outlets/{outletId}/menu-items/{menuItemId}',
    operationId: 'assignMenuItem',
    tag: 'Outlet menu',
    summary: 'Assign an item to an outlet, or update the assignment',
    description:
      'Creates the assignment (and the item’s stock row, at 0) or updates it. `priceOverrideCents` sets this ' +
      'outlet’s own price; `null` goes back to the master price.',
    access: 'hq',
    request: {
      params: assignSchemas.params,
      body: json(assignSchemas.body, { priceOverrideCents: 750, isAvailable: true }),
    },
    responses: {
      200: {
        description: 'The assignment existed and was updated',
        schema: dataOf(OutletMenuItemSchema),
      },
      201: { description: 'Assigned', schema: dataOf(OutletMenuItemSchema) },
      400: VALIDATION,
      404: error('`NOT_FOUND`: no outlet or no menu item with this id.'),
      422: error('`MENU_ITEM_INACTIVE`: a retired menu item cannot be assigned.'),
    },
  },
  {
    method: 'patch',
    path: '/outlets/{outletId}/menu-items/{menuItemId}',
    operationId: 'updateAssignment',
    tag: 'Outlet menu',
    summary: 'Pause, resume or re-price an assigned item',
    description:
      'Outlet staff may pause and resume (`isAvailable`); only HQ may change `priceOverrideCents`.',
    access: 'outlet',
    request: {
      params: updateAssignmentSchemas.params,
      body: json(updateAssignmentSchemas.body, { isAvailable: false }),
    },
    responses: {
      200: { description: 'Updated', schema: dataOf(OutletMenuItemSchema) },
      400: VALIDATION,
      403: error(
        '`OUTLET_FORBIDDEN`: another outlet’s menu. `PRICE_CHANGE_FORBIDDEN`: staff sent a price.',
      ),
      404: error('`NOT_ASSIGNED`: the item is not on this outlet’s menu.'),
    },
  },
  {
    method: 'delete',
    path: '/outlets/{outletId}/menu-items/{menuItemId}',
    operationId: 'unassignMenuItem',
    tag: 'Outlet menu',
    summary: 'Remove an item from an outlet',
    description:
      'Removes the assignment and its stock row. Past sales keep their own copy of the item.',
    access: 'hq',
    request: { params: unassignSchemas.params },
    responses: {
      204: { description: 'Removed' },
      400: VALIDATION,
      404: error('`NOT_ASSIGNED`: the item is not on this outlet’s menu.'),
    },
  },

  // ---------------------------------------------------------------- Inventory
  {
    method: 'get',
    path: '/outlets/{outletId}/inventory',
    operationId: 'listInventory',
    tag: 'Inventory',
    summary: 'Stock per assigned item',
    access: 'outlet',
    request: { params: listInventorySchemas.params },
    responses: {
      200: {
        description: 'One line per assigned item',
        schema: dataOf(z.array(InventoryLineSchema)),
      },
      400: VALIDATION,
      404: outletNotFound,
    },
  },
  {
    method: 'post',
    path: '/outlets/{outletId}/inventory/{menuItemId}/adjustments',
    operationId: 'adjustStock',
    tag: 'Inventory',
    summary: 'Restock, write off or correct stock',
    description:
      'A change by `quantityDelta`, recorded in the stock ledger. `RESTOCK` must add, `WASTE` must remove, ' +
      '`CORRECTION` either way. Stock never goes below zero.',
    access: 'outlet',
    request: {
      params: adjustStockSchemas.params,
      body: json(adjustStockSchemas.body, {
        quantityDelta: 24,
        reason: 'RESTOCK',
        note: 'Morning delivery',
      }),
    },
    responses: {
      201: { description: 'Recorded', schema: dataOf(StockAdjustmentSchema) },
      400: VALIDATION,
      404: error('`NOT_ASSIGNED`: the item is not on this outlet’s menu.'),
      409: error(
        '`INSUFFICIENT_STOCK`: the change would take stock below zero (`details.available`).',
      ),
    },
  },
  {
    method: 'get',
    path: '/outlets/{outletId}/inventory/{menuItemId}/movements',
    operationId: 'listStockMovements',
    tag: 'Inventory',
    summary: 'The item’s stock ledger',
    description: 'Every change with its reason and the stock after it, newest first.',
    access: 'outlet',
    request: { params: listMovementsSchemas.params, query: listMovementsSchemas.query },
    responses: {
      200: { description: 'A page of movements', schema: pageOf(MovementSchema) },
      400: VALIDATION,
    },
  },

  // ---------------------------------------------------------------- Sales
  {
    method: 'get',
    path: '/outlets/{outletId}/sales',
    operationId: 'listSales',
    tag: 'Sales',
    summary: 'Sales history',
    description: 'Newest receipt first. `from` is inclusive, `to` exclusive.',
    access: 'outlet',
    request: { params: listSalesSchemas.params, query: listSalesSchemas.query },
    responses: {
      200: { description: 'A page of sales', schema: pageOf(SaleSchema) },
      400: VALIDATION,
    },
  },
  {
    method: 'post',
    path: '/outlets/{outletId}/sales',
    operationId: 'createSale',
    tag: 'Sales',
    summary: 'Record a sale',
    description:
      'One transaction: checks every item is sellable here, deducts the stock, takes the next receipt number ' +
      '(sequential and gap-free per outlet) and records the sale. Prices come from the outlet’s menu, never from ' +
      'the request. Lines for the same item are merged.\n\n' +
      'Send an `Idempotency-Key` (a new UUID per sale) so a retry after a network error cannot record the sale ' +
      'twice: the same key with the same body returns the original sale with `200` and `Idempotent-Replayed: true`.',
    access: 'outlet',
    request: {
      params: createSaleSchemas.params,
      headers: z.object({
        'Idempotency-Key': idempotencyKeySchema.optional().openapi({
          description: 'Makes retries safe; 8-128 letters, digits, dashes or underscores',
          example: '3f1c2b8e-9d4a-4c55-8a51-2f6f2f0d9b7e',
        }),
      }),
      body: json(createSaleSchemas.body, {
        items: [
          { menuItemId: '00000000-0000-4000-8000-000000000000', quantity: 2 },
          { menuItemId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
        ],
        paymentMethod: 'CARD',
        note: 'Table 4',
      }),
    },
    responses: {
      200: {
        description: 'A retry with a key already used for this same sale: the original sale',
        schema: dataOf(SaleSchema),
        headers: {
          'Idempotent-Replayed': { description: 'Always `true`', schema: { type: 'string' } },
        },
      },
      201: { description: 'Recorded; the receipt', schema: dataOf(SaleSchema) },
      400: error('`VALIDATION_ERROR` or `INVALID_JSON` (see above), `INVALID_IDEMPOTENCY_KEY`.'),
      404: outletNotFound,
      409: error(
        '`INSUFFICIENT_STOCK`: `details` lists each short item with `requested` and `available`. ' +
          '`IDEMPOTENCY_KEY_REUSED`: the key was used for a different sale.',
      ),
      422: error(
        '`ITEMS_NOT_SELLABLE`: `details` lists items not on this outlet’s menu or paused. `OUTLET_INACTIVE`.',
      ),
    },
  },
  {
    method: 'get',
    path: '/outlets/{outletId}/sales/{saleId}',
    operationId: 'getSale',
    tag: 'Sales',
    summary: 'Get a sale with its lines',
    access: 'outlet',
    request: { params: getSaleSchemas.params },
    responses: {
      200: { description: 'The sale', schema: dataOf(SaleSchema) },
      400: VALIDATION,
      404: error('`NOT_FOUND`: no sale with this id at this outlet.'),
    },
  },

  // ---------------------------------------------------------------- Reports
  {
    method: 'get',
    path: '/reports/revenue-by-outlet',
    operationId: 'getRevenueByOutlet',
    tag: 'Reports',
    summary: 'Revenue by outlet',
    description:
      'Revenue, sales and items sold per outlet (outlets without sales included) and in total, highest revenue ' +
      'first. `from` is inclusive, `to` exclusive; leave both out for all time.',
    access: 'hq',
    request: { query: revenueByOutletSchemas.query },
    responses: {
      200: { description: 'The report', schema: dataOf(RevenueReportSchema) },
      400: VALIDATION,
    },
  },
  {
    method: 'get',
    path: '/reports/top-items',
    operationId: 'getTopItems',
    tag: 'Reports',
    summary: 'Top-selling items per outlet',
    description:
      'Ranked by quantity, then revenue. HQ gets every outlet, or one with `outletId`; outlet staff always get ' +
      'their own outlet.',
    access: 'signedIn',
    request: { query: topItemsSchemas.query },
    responses: {
      200: { description: 'The report', schema: dataOf(TopItemsReportSchema) },
      400: VALIDATION,
      403: error('`OUTLET_FORBIDDEN`: staff asked for another outlet.'),
      404: outletNotFound,
    },
  },

  // ---------------------------------------------------------------- Health (not under /api/v1)
  {
    method: 'get',
    path: '/health',
    root: true,
    operationId: 'health',
    tag: 'Health',
    summary: 'Liveness',
    description:
      'The process answers; does not touch the database. Served by the API itself, not through the web app’s `/api`.',
    access: 'public',
    responses: { 200: { description: 'Alive', schema: HealthSchema } },
  },
  {
    method: 'get',
    path: '/ready',
    root: true,
    operationId: 'ready',
    tag: 'Health',
    summary: 'Readiness',
    description:
      'The API can serve traffic: the database answers. Not through the web app’s `/api`.',
    access: 'public',
    responses: {
      200: { description: 'Ready', schema: ReadySchema },
      503: { description: 'The database does not answer', schema: ReadySchema },
    },
  },
];

const TAGS = [
  { name: 'Auth', description: 'Sign in and get a bearer token.' },
  { name: 'Outlets', description: 'The company’s outlets (HQ).' },
  { name: 'Master menu', description: 'HQ’s master menu.' },
  {
    name: 'Outlet menu',
    description: 'What each outlet sells: assignments, outlet prices, pausing and resuming.',
  },
  { name: 'Inventory', description: 'Stock per outlet and item, and its ledger.' },
  { name: 'Sales', description: 'The point of sale: recording sales and their history.' },
  { name: 'Reports', description: 'Revenue and top sellers.' },
  { name: 'Health', description: 'For load balancers and orchestrators.' },
];

const DESCRIPTION = `
The API of Outlet HQ: one company, many F&B outlets. HQ owns the master menu, assigns items to outlets (with an
optional outlet price) and reads reports; each outlet sells only what it was assigned and keeps its own stock.

**Authentication.** Call \`POST /auth/login\` (demo: \`hq@example.com\` or \`orchard.staff@example.com\`, password
\`Password123!\`), then press **Authorize** and paste the \`token\`. HQ admins may use every outlet; outlet staff
only their own.

**Conventions.**
- Amounts are integers in minor units (\`*Cents\`) of the deployment's currency (\`currency\` in responses).
- Dates are ISO 8601 with a time zone; in ranges \`from\` is inclusive and \`to\` exclusive.
- Success bodies are \`{ "data": ... }\`; lists add \`"meta": { "limit", "offset", "total" }\`.
- Errors are \`{ "error": { "code", "message", "details?", "requestId" } }\` with a stable \`code\`. Any
  operation may also answer \`500 INTERNAL_ERROR\`, or \`503 BUSY\` / \`TIMEOUT\` when the database is under
  contention (safe to retry).
- Unknown fields in a body or query are rejected.
`.trim();

/** Every response an operation documents: the ones its access level brings (401, 403), then its own. */
export const documentedResponses = (op: Operation): Record<number, DocumentedResponse> => ({
  ...accessResponses(op.access),
  ...op.responses,
});

/** Builds the OpenAPI 3.1 document from the operations above. */
export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'The `token` from `POST /auth/login`.',
  });

  for (const op of operations) {
    const responses: Record<string, ResponseConfig> = {};
    for (const [status, response] of Object.entries(documentedResponses(op))) {
      responses[status] = {
        description: response.description,
        headers: { ...requestIdHeader, ...(response.headers as object | undefined) },
        ...(response.schema
          ? { content: { 'application/json': { schema: response.schema } } }
          : {}),
      };
    }
    registry.registerPath({
      method: op.method,
      path: op.path,
      operationId: op.operationId,
      tags: [op.tag],
      summary: op.summary,
      description: [op.description, `**Access:** ${ACCESS_NOTE[op.access]}`]
        .filter(Boolean)
        .join('\n\n'),
      security: op.access === 'public' ? [] : [{ bearerAuth: [] }],
      ...(op.root ? { servers: [{ url: '/', description: 'The API itself' }] } : {}),
      ...(op.request ? { request: op.request } : {}),
      responses,
    });
  }

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Outlet HQ API',
      version: '1.0.0',
      description: DESCRIPTION,
    },
    servers: [{ url: API_BASE, description: `This deployment (amounts in ${env.CURRENCY})` }],
    tags: TAGS,
    security: [{ bearerAuth: [] }],
  });
}
