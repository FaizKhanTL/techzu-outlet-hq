import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import { pool } from '../../src/db/pool';
import { buildOpenApiDocument, documentedResponses, operations } from '../../src/docs/openapi';
import {
  PASSWORD,
  api,
  assignItem,
  auth,
  createMenuItem,
  createOutlet,
  createUser,
  resetDatabase,
  sell,
  storeFixture,
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

/** Every method, path and status the tests below saw, to check at the end that every operation was exercised. */
const seen = new Set<string>();

/**
 * The response must be one the documentation lists for this operation, and its body must match the documented
 * schema exactly (the schemas are strict, so an undocumented field fails too).
 */
function conforms(res: Response, method: string, path: string, code?: string) {
  const op = operations.find((o) => o.method === method && o.path === path);
  expect(op, `${method} ${path} is not documented`).toBeDefined();
  const documented = documentedResponses(op!)[res.status];
  expect(
    documented,
    `${method.toUpperCase()} ${path} answered ${res.status}, which is not documented: ${JSON.stringify(res.body)}`,
  ).toBeDefined();
  if (documented!.schema) {
    const parsed = documented!.schema.safeParse(res.body);
    expect(
      parsed.success ? null : parsed.error.issues,
      `${method} ${path} ${res.status}`,
    ).toBeNull();
  } else {
    expect(res.text ?? '').toBe('');
  }
  if (code) expect(res.body.error.code).toBe(code);
  seen.add(`${method} ${path} ${res.status}`);
  return res;
}

describe('the API answers as documented', () => {
  it('auth and outlets', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const staff = await createUser('OUTLET_STAFF', outlet.id);
    const other = await createOutlet(hq.token);

    conforms(
      await api().post('/api/v1/auth/login').send({ email: hq.email, password: PASSWORD }),
      'post',
      '/auth/login',
    );
    conforms(
      await api().post('/api/v1/auth/login').send({ email: hq.email, password: 'wrong' }),
      'post',
      '/auth/login',
      'INVALID_CREDENTIALS',
    );
    conforms(
      await api().post('/api/v1/auth/login').send({ email: 'not-an-email' }),
      'post',
      '/auth/login',
      'VALIDATION_ERROR',
    );
    conforms(await api().get('/api/v1/auth/me').set(auth(staff.token)), 'get', '/auth/me');
    conforms(await api().get('/api/v1/auth/me'), 'get', '/auth/me', 'TOKEN_REQUIRED');

    conforms(await api().get('/api/v1/outlets?limit=5').set(auth(hq.token)), 'get', '/outlets');
    conforms(
      await api().get('/api/v1/outlets').set(auth(staff.token)),
      'get',
      '/outlets',
      'ROLE_FORBIDDEN',
    );
    conforms(
      await api()
        .post('/api/v1/outlets')
        .set(auth(hq.token))
        .send({ code: 'MV', name: 'Mid Valley', address: 'KL' }),
      'post',
      '/outlets',
    );
    conforms(
      await api().post('/api/v1/outlets').set(auth(hq.token)).send({ code: 'MV', name: 'Again' }),
      'post',
      '/outlets',
      'OUTLET_CODE_TAKEN',
    );
    conforms(
      await api().get(`/api/v1/outlets/${outlet.id}`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}',
    );
    conforms(
      await api().get(`/api/v1/outlets/${other.id}`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}',
      'OUTLET_FORBIDDEN',
    );
    conforms(
      await api().get(`/api/v1/outlets/${randomUUID()}`).set(auth(hq.token)),
      'get',
      '/outlets/{outletId}',
      'NOT_FOUND',
    );
    conforms(
      await api()
        .patch(`/api/v1/outlets/${outlet.id}`)
        .set(auth(hq.token))
        .send({ name: 'Renamed' }),
      'patch',
      '/outlets/{outletId}',
    );
  });

  it('master menu and outlet menu', async () => {
    const { hq, outlet, staff, item } = await storeFixture();
    const other = await createOutlet(hq.token);

    conforms(await api().get('/api/v1/menu-items').set(auth(hq.token)), 'get', '/menu-items');
    const created = conforms(
      await api()
        .post('/api/v1/menu-items')
        .set(auth(hq.token))
        .send({ sku: 'cof-mocha', name: 'Mocha', basePriceCents: 1450, description: 'Hot' }),
      'post',
      '/menu-items',
    ).body.data as { id: string };
    conforms(
      await api()
        .post('/api/v1/menu-items')
        .set(auth(hq.token))
        .send({ sku: 'COF-MOCHA', name: 'Mocha', basePriceCents: 1450 }),
      'post',
      '/menu-items',
      'SKU_TAKEN',
    );
    conforms(
      await api().get(`/api/v1/menu-items/${item.id}`).set(auth(hq.token)),
      'get',
      '/menu-items/{menuItemId}',
    );
    conforms(
      await api().get(`/api/v1/menu-items/${randomUUID()}`).set(auth(hq.token)),
      'get',
      '/menu-items/{menuItemId}',
      'NOT_FOUND',
    );
    conforms(
      await api()
        .patch(`/api/v1/menu-items/${item.id}`)
        .set(auth(hq.token))
        .send({ basePriceCents: 1100 }),
      'patch',
      '/menu-items/{menuItemId}',
    );

    const assignment = `/api/v1/outlets/${outlet.id}/menu-items`;
    conforms(
      await api().get(`${assignment}?sellable=true`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}/menu-items',
    );
    conforms(
      await api().get(`/api/v1/outlets/${other.id}/menu-items`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}/menu-items',
      'OUTLET_FORBIDDEN',
    );
    conforms(
      await api()
        .put(`${assignment}/${created.id}`)
        .set(auth(hq.token))
        .send({ priceOverrideCents: 1500 }),
      'put',
      '/outlets/{outletId}/menu-items/{menuItemId}',
    );
    conforms(
      await api()
        .put(`${assignment}/${created.id}`)
        .set(auth(hq.token))
        .send({ priceOverrideCents: null }),
      'put',
      '/outlets/{outletId}/menu-items/{menuItemId}',
    );
    const retired = await createMenuItem(hq.token);
    await api()
      .patch(`/api/v1/menu-items/${retired.id}`)
      .set(auth(hq.token))
      .send({ isActive: false });
    conforms(
      await api().put(`${assignment}/${retired.id}`).set(auth(hq.token)).send({}),
      'put',
      '/outlets/{outletId}/menu-items/{menuItemId}',
      'MENU_ITEM_INACTIVE',
    );
    conforms(
      await api()
        .patch(`${assignment}/${item.id}`)
        .set(auth(staff.token))
        .send({ isAvailable: false }),
      'patch',
      '/outlets/{outletId}/menu-items/{menuItemId}',
    );
    conforms(
      await api()
        .patch(`${assignment}/${item.id}`)
        .set(auth(staff.token))
        .send({ priceOverrideCents: 1 }),
      'patch',
      '/outlets/{outletId}/menu-items/{menuItemId}',
      'PRICE_CHANGE_FORBIDDEN',
    );
    conforms(
      await api().delete(`${assignment}/${created.id}`).set(auth(hq.token)),
      'delete',
      '/outlets/{outletId}/menu-items/{menuItemId}',
    );
    conforms(
      await api().delete(`${assignment}/${created.id}`).set(auth(hq.token)),
      'delete',
      '/outlets/{outletId}/menu-items/{menuItemId}',
      'NOT_ASSIGNED',
    );
  });

  it('inventory', async () => {
    const { outlet, staff, item } = await storeFixture({ stock: 5 });
    const base = `/api/v1/outlets/${outlet.id}/inventory`;

    conforms(await api().get(base).set(auth(staff.token)), 'get', '/outlets/{outletId}/inventory');
    conforms(
      await api()
        .post(`${base}/${item.id}/adjustments`)
        .set(auth(staff.token))
        .send({ quantityDelta: -2, reason: 'WASTE', note: 'Dropped' }),
      'post',
      '/outlets/{outletId}/inventory/{menuItemId}/adjustments',
    );
    conforms(
      await api()
        .post(`${base}/${item.id}/adjustments`)
        .set(auth(staff.token))
        .send({ quantityDelta: -10, reason: 'CORRECTION' }),
      'post',
      '/outlets/{outletId}/inventory/{menuItemId}/adjustments',
      'INSUFFICIENT_STOCK',
    );
    conforms(
      await api()
        .post(`${base}/${randomUUID()}/adjustments`)
        .set(auth(staff.token))
        .send({ quantityDelta: 1, reason: 'RESTOCK' }),
      'post',
      '/outlets/{outletId}/inventory/{menuItemId}/adjustments',
      'NOT_ASSIGNED',
    );
    conforms(
      await api().get(`${base}/${item.id}/movements?limit=2`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}/inventory/{menuItemId}/movements',
    );
  });

  it('sales', async () => {
    const { hq, outlet, staff, item } = await storeFixture({ stock: 3 });
    const unassigned = await createMenuItem(hq.token);
    const path = '/outlets/{outletId}/sales';
    const key = randomUUID();

    const sale = conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 2 }], key),
      'post',
      path,
    ).body.data as { id: string };
    const replay = conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 2 }], key),
      'post',
      path,
    );
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }], key),
      'post',
      path,
      'IDEMPOTENCY_KEY_REUSED',
    );
    conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 5 }]),
      'post',
      path,
      'INSUFFICIENT_STOCK',
    );
    conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: unassigned.id, quantity: 1 }]),
      'post',
      path,
      'ITEMS_NOT_SELLABLE',
    );
    conforms(
      await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 1 }], 'bad key!'),
      'post',
      path,
      'INVALID_IDEMPOTENCY_KEY',
    );
    conforms(
      await sell(hq.token, randomUUID(), [{ menuItemId: item.id, quantity: 1 }]),
      'post',
      path,
      'NOT_FOUND',
    );

    conforms(
      await api().get(`/api/v1/outlets/${outlet.id}/sales?limit=10`).set(auth(staff.token)),
      'get',
      path,
    );
    conforms(
      await api().get(`/api/v1/outlets/${outlet.id}/sales/${sale.id}`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}/sales/{saleId}',
    );
    conforms(
      await api().get(`/api/v1/outlets/${outlet.id}/sales/${randomUUID()}`).set(auth(staff.token)),
      'get',
      '/outlets/{outletId}/sales/{saleId}',
      'NOT_FOUND',
    );
  });

  it('reports and health', async () => {
    const { hq, outlet, staff, item } = await storeFixture();
    const other = await createOutlet(hq.token);
    await assignItem(hq.token, other.id, item.id);
    await sell(staff.token, outlet.id, [{ menuItemId: item.id, quantity: 2 }]);

    conforms(
      await api()
        .get('/api/v1/reports/revenue-by-outlet?from=2000-01-01T00:00:00Z')
        .set(auth(hq.token)),
      'get',
      '/reports/revenue-by-outlet',
    );
    conforms(
      await api()
        .get('/api/v1/reports/revenue-by-outlet?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z')
        .set(auth(hq.token)),
      'get',
      '/reports/revenue-by-outlet',
      'VALIDATION_ERROR',
    );
    conforms(
      await api().get('/api/v1/reports/top-items').set(auth(hq.token)),
      'get',
      '/reports/top-items',
    );
    conforms(
      await api().get('/api/v1/reports/top-items?limit=3').set(auth(staff.token)),
      'get',
      '/reports/top-items',
    );
    conforms(
      await api().get(`/api/v1/reports/top-items?outletId=${other.id}`).set(auth(staff.token)),
      'get',
      '/reports/top-items',
      'OUTLET_FORBIDDEN',
    );

    conforms(await api().get('/health'), 'get', '/health');
    conforms(await api().get('/ready'), 'get', '/ready');
  });

  it('exercised the success response of every documented operation', () => {
    const missing = operations.flatMap((op) =>
      Object.keys(op.responses)
        .filter((status) => status.startsWith('2'))
        .map((status) => `${op.method} ${op.path} ${status}`)
        .filter((entry) => !seen.has(entry)),
    );
    expect(missing).toEqual([]);
  });
});

describe('the documentation endpoints', () => {
  it('serve the OpenAPI document and the Swagger UI', async () => {
    const spec = await api().get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body).toEqual(JSON.parse(JSON.stringify(buildOpenApiDocument())));

    const redirect = await api().get('/api/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('/api/docs/');

    const page = await api().get('/api/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');
    expect((await api().get('/api/docs/swagger-ui-init.js')).text).toContain('Outlet HQ API');
  });
});
