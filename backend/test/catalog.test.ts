import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import { api, auth, createMenuItem, createOutlet, createUser, resetDatabase } from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('outlets', () => {
  it('lets HQ create, read, list and update outlets; the code is normalised to upper case', async () => {
    const hq = await createUser('HQ_ADMIN');
    const created = await api()
      .post('/api/v1/outlets')
      .set(auth(hq.token))
      .send({ code: ' klcc ', name: ' KLCC Flagship ', address: '' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      code: 'KLCC',
      name: 'KLCC Flagship',
      address: null,
      isActive: true,
    });

    const id = created.body.data.id;
    const updated = await api()
      .patch(`/api/v1/outlets/${id}`)
      .set(auth(hq.token))
      .send({ address: 'Level 1' });
    expect(updated.body.data).toMatchObject({ name: 'KLCC Flagship', address: 'Level 1' });

    const cleared = await api()
      .patch(`/api/v1/outlets/${id}`)
      .set(auth(hq.token))
      .send({ address: null });
    expect(cleared.body.data.address).toBeNull();

    await createOutlet(hq.token, { code: 'PJ' });
    const list = await api().get('/api/v1/outlets?limit=1').set(auth(hq.token));
    expect(list.body.meta).toEqual({ limit: 1, offset: 0, total: 2 });
    expect(list.body.data).toHaveLength(1);
  });

  it('refuses a duplicate or malformed code', async () => {
    const hq = await createUser('HQ_ADMIN');
    await createOutlet(hq.token, { code: 'KLCC' });
    const dup = await api()
      .post('/api/v1/outlets')
      .set(auth(hq.token))
      .send({ code: 'klcc', name: 'Again' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('OUTLET_CODE_TAKEN');

    const bad = await api()
      .post('/api/v1/outlets')
      .set(auth(hq.token))
      .send({ code: 'has space', name: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['body.code', 'body.name']),
    );
  });

  it('lets staff read only their own outlet and nothing HQ-only', async () => {
    const hq = await createUser('HQ_ADMIN');
    const mine = await createOutlet(hq.token);
    const other = await createOutlet(hq.token);
    const staff = await createUser('OUTLET_STAFF', mine.id);

    expect((await api().get(`/api/v1/outlets/${mine.id}`).set(auth(staff.token))).status).toBe(200);
    const foreign = await api().get(`/api/v1/outlets/${other.id}`).set(auth(staff.token));
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('OUTLET_FORBIDDEN');
    expect((await api().get('/api/v1/outlets').set(auth(staff.token))).status).toBe(403);
    expect(
      (await api().post('/api/v1/outlets').set(auth(staff.token)).send({ code: 'X1', name: 'X' }))
        .status,
    ).toBe(403);
    expect(
      (await api().patch(`/api/v1/outlets/${mine.id}`).set(auth(staff.token)).send({ name: 'X' }))
        .status,
    ).toBe(403);
  });

  it('answers 404 for an unknown outlet and 400 for a malformed id', async () => {
    const hq = await createUser('HQ_ADMIN');
    expect(
      (await api().get('/api/v1/outlets/00000000-0000-4000-8000-000000000000').set(auth(hq.token)))
        .status,
    ).toBe(404);
    expect((await api().get('/api/v1/outlets/not-a-uuid').set(auth(hq.token))).status).toBe(400);
    const empty = await api()
      .patch('/api/v1/outlets/00000000-0000-4000-8000-000000000000')
      .set(auth(hq.token))
      .send({});
    expect(empty.status).toBe(400);
  });
});

describe('master menu', () => {
  it('lets HQ create, update and list menu items', async () => {
    const hq = await createUser('HQ_ADMIN');
    const created = await api()
      .post('/api/v1/menu-items')
      .set(auth(hq.token))
      .send({
        sku: 'cof-latte',
        name: 'Latte',
        category: 'Coffee',
        basePriceCents: 1200,
        description: 'Milk',
      });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      sku: 'COF-LATTE',
      basePriceCents: 1200,
      isActive: true,
      assignedOutletCount: 0,
    });

    const id = created.body.data.id;
    const updated = await api()
      .patch(`/api/v1/menu-items/${id}`)
      .set(auth(hq.token))
      .send({ basePriceCents: 1300, description: null, isActive: false });
    expect(updated.body.data).toMatchObject({
      basePriceCents: 1300,
      description: null,
      isActive: false,
      name: 'Latte',
    });

    await createMenuItem(hq.token, { category: 'Tea' });
    const coffee = await api().get('/api/v1/menu-items?category=Coffee').set(auth(hq.token));
    expect(coffee.body.data.map((item: { sku: string }) => item.sku)).toEqual(['COF-LATTE']);
    const active = await api().get('/api/v1/menu-items?isActive=true').set(auth(hq.token));
    expect(active.body.meta.total).toBe(1);
  });

  it('refuses a duplicate SKU, a negative or fractional price, and unknown fields', async () => {
    const hq = await createUser('HQ_ADMIN');
    await createMenuItem(hq.token, { sku: 'DUP-1' });
    const dup = await api()
      .post('/api/v1/menu-items')
      .set(auth(hq.token))
      .send({ sku: 'dup-1', name: 'X', basePriceCents: 1 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SKU_TAKEN');

    for (const basePriceCents of [-1, 10.5, '100']) {
      const res = await api()
        .post('/api/v1/menu-items')
        .set(auth(hq.token))
        .send({ sku: 'NEW-1', name: 'X', basePriceCents });
      expect(res.status).toBe(400);
    }
    const extra = await api()
      .post('/api/v1/menu-items')
      .set(auth(hq.token))
      .send({ sku: 'NEW-2', name: 'X', basePriceCents: 1, isActive: false });
    expect(extra.status).toBe(400);
  });

  it('is HQ-only', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const staff = await createUser('OUTLET_STAFF', outlet.id);
    expect((await api().get('/api/v1/menu-items').set(auth(staff.token))).status).toBe(403);
    expect(
      (
        await api()
          .post('/api/v1/menu-items')
          .set(auth(staff.token))
          .send({ sku: 'A1', name: 'A', basePriceCents: 1 })
      ).status,
    ).toBe(403);
  });
});
