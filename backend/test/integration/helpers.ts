import request from 'supertest';
import { createApp } from '../../src/app';
import { pool } from '../../src/db/pool';
import { hashPassword } from '../../src/modules/auth/password';
import { signAccessToken } from '../../src/modules/auth/token';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Password123!';

let passwordHash: Promise<string> | undefined;
const hashed = () => (passwordHash ??= hashPassword(PASSWORD));

/** Empties every table (not the migrations), so each test starts from nothing. */
export async function resetDatabase() {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  await pool.query(
    `TRUNCATE ${rows.map((row) => `"${row.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

let sequence = 0;
const next = () => ++sequence;

export async function createUser(
  role: 'HQ_ADMIN' | 'OUTLET_STAFF',
  outletId: string | null = null,
  email?: string,
) {
  const address = email ?? `user${next()}@example.com`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, role, outlet_id) VALUES ($1, 'Test User', $2, $3, $4) RETURNING id`,
    [address, await hashed(), role, outletId],
  );
  return { id: rows[0]!.id, email: address, token: signAccessToken(rows[0]!.id).token };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function createOutlet(
  hqToken: string,
  overrides: Partial<{ code: string; name: string }> = {},
) {
  const n = next();
  const res = await api()
    .post('/api/v1/outlets')
    .set(auth(hqToken))
    .send({ code: overrides.code ?? `OUT${n}`, name: overrides.name ?? `Outlet ${n}` });
  if (res.status !== 201)
    throw new Error(`createOutlet: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; code: string; name: string };
}

export async function createMenuItem(
  hqToken: string,
  overrides: Partial<{ sku: string; name: string; basePriceCents: number; category: string }> = {},
) {
  const n = next();
  const res = await api()
    .post('/api/v1/menu-items')
    .set(auth(hqToken))
    .send({
      sku: overrides.sku ?? `SKU-${n}`,
      name: overrides.name ?? `Item ${n}`,
      basePriceCents: overrides.basePriceCents ?? 1000,
      category: overrides.category ?? 'General',
    });
  if (res.status !== 201)
    throw new Error(`createMenuItem: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { id: string; sku: string; name: string; basePriceCents: number };
}

export async function assignItem(
  hqToken: string,
  outletId: string,
  menuItemId: string,
  body: { priceOverrideCents?: number | null; isAvailable?: boolean } = {},
) {
  const res = await api()
    .put(`/api/v1/outlets/${outletId}/menu-items/${menuItemId}`)
    .set(auth(hqToken))
    .send(body);
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`assignItem: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function restock(
  token: string,
  outletId: string,
  menuItemId: string,
  quantity: number,
) {
  const res = await api()
    .post(`/api/v1/outlets/${outletId}/inventory/${menuItemId}/adjustments`)
    .set(auth(token))
    .send({ quantityDelta: quantity, reason: 'RESTOCK' });
  if (res.status !== 201) throw new Error(`restock: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function stockOf(outletId: string, menuItemId: string) {
  const { rows } = await pool.query<{ quantity: number }>(
    'SELECT quantity FROM inventory WHERE outlet_id = $1 AND menu_item_id = $2',
    [outletId, menuItemId],
  );
  return rows[0]?.quantity;
}

/** An HQ admin, one outlet with its staff member, and one item assigned there with stock. */
export async function storeFixture({
  stock = 100,
  basePriceCents = 1000,
  priceOverrideCents = null as number | null,
} = {}) {
  const hq = await createUser('HQ_ADMIN');
  const outlet = await createOutlet(hq.token);
  const staff = await createUser('OUTLET_STAFF', outlet.id);
  const item = await createMenuItem(hq.token, { basePriceCents });
  await assignItem(hq.token, outlet.id, item.id, { priceOverrideCents });
  if (stock > 0) await restock(hq.token, outlet.id, item.id, stock);
  return { hq, outlet, staff, item };
}

export const sell = (
  token: string,
  outletId: string,
  items: { menuItemId: string; quantity: number }[],
  key?: string,
) => {
  const req = api().post(`/api/v1/outlets/${outletId}/sales`).set(auth(token));
  if (key) req.set('Idempotency-Key', key);
  return req.send({ items, paymentMethod: 'CASH' });
};
