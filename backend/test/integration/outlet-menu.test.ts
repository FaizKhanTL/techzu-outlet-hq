import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { pool } from '../src/db/pool';
import {
  api,
  assignItem,
  auth,
  createMenuItem,
  createOutlet,
  createUser,
  resetDatabase,
  stockOf,
} from './helpers';

beforeEach(resetDatabase);
afterAll(() => pool.end());

describe('outlet menu', () => {
  it('assigns an item (201), updates it on a second PUT (200), and creates a stock row at zero', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const item = await createMenuItem(hq.token, { basePriceCents: 1000 });
    const url = `/api/v1/outlets/${outlet.id}/menu-items/${item.id}`;

    const first = await api().put(url).set(auth(hq.token)).send({});
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      priceCents: 1000,
      priceOverrideCents: null,
      isSellable: true,
      stockQuantity: 0,
    });
    expect(await stockOf(outlet.id, item.id)).toBe(0);

    const second = await api().put(url).set(auth(hq.token)).send({ priceOverrideCents: 1250 });
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({
      basePriceCents: 1000,
      priceOverrideCents: 1250,
      priceCents: 1250,
    });

    // A PUT without the field keeps the override; null clears it back to the master price.
    expect(
      (await api().put(url).set(auth(hq.token)).send({ isAvailable: true })).body.data.priceCents,
    ).toBe(1250);
    expect(
      (await api().put(url).set(auth(hq.token)).send({ priceOverrideCents: null })).body.data
        .priceCents,
    ).toBe(1000);
  });

  it('shows each outlet only its own assigned items, at its own price', async () => {
    const hq = await createUser('HQ_ADMIN');
    const a = await createOutlet(hq.token);
    const b = await createOutlet(hq.token);
    const latte = await createMenuItem(hq.token, { basePriceCents: 1200 });
    const tea = await createMenuItem(hq.token, { basePriceCents: 600 });
    await createMenuItem(hq.token); // assigned nowhere
    await assignItem(hq.token, a.id, latte.id, { priceOverrideCents: 1300 });
    await assignItem(hq.token, b.id, latte.id);
    await assignItem(hq.token, b.id, tea.id);

    const staffA = await createUser('OUTLET_STAFF', a.id);
    const menuA = await api().get(`/api/v1/outlets/${a.id}/menu-items`).set(auth(staffA.token));
    expect(
      menuA.body.data.map((row: { menuItemId: string; priceCents: number }) => [
        row.menuItemId,
        row.priceCents,
      ]),
    ).toEqual([[latte.id, 1300]]);
    const menuB = await api().get(`/api/v1/outlets/${b.id}/menu-items`).set(auth(hq.token));
    expect(menuB.body.data).toHaveLength(2);
    expect(
      (await api().get(`/api/v1/outlets/${b.id}/menu-items`).set(auth(staffA.token))).status,
    ).toBe(403);
  });

  it('sellable=true leaves out paused items and items deactivated on the master menu', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const ok = await createMenuItem(hq.token);
    const paused = await createMenuItem(hq.token);
    const retired = await createMenuItem(hq.token);
    for (const item of [ok, paused, retired]) await assignItem(hq.token, outlet.id, item.id);
    await assignItem(hq.token, outlet.id, paused.id, { isAvailable: false });
    await api()
      .patch(`/api/v1/menu-items/${retired.id}`)
      .set(auth(hq.token))
      .send({ isActive: false });

    const all = await api().get(`/api/v1/outlets/${outlet.id}/menu-items`).set(auth(hq.token));
    expect(all.body.data).toHaveLength(3);
    const sellable = await api()
      .get(`/api/v1/outlets/${outlet.id}/menu-items?sellable=true`)
      .set(auth(hq.token));
    expect(sellable.body.data.map((row: { menuItemId: string }) => row.menuItemId)).toEqual([
      ok.id,
    ]);
  });

  it('lets staff pause and resume an item but not change its price or the assignment', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const staff = await createUser('OUTLET_STAFF', outlet.id);
    const item = await createMenuItem(hq.token);
    await assignItem(hq.token, outlet.id, item.id);
    const url = `/api/v1/outlets/${outlet.id}/menu-items/${item.id}`;

    const paused = await api().patch(url).set(auth(staff.token)).send({ isAvailable: false });
    expect(paused.body.data).toMatchObject({ isAvailable: false, isSellable: false });
    const price = await api().patch(url).set(auth(staff.token)).send({ priceOverrideCents: 1 });
    expect(price.status).toBe(403);
    expect(price.body.error.code).toBe('PRICE_CHANGE_FORBIDDEN');
    expect((await api().put(url).set(auth(staff.token)).send({})).status).toBe(403);
    expect((await api().delete(url).set(auth(staff.token))).status).toBe(403);
  });

  it('unassigns an item with its stock, and refuses to assign an inactive or unknown item', async () => {
    const hq = await createUser('HQ_ADMIN');
    const outlet = await createOutlet(hq.token);
    const item = await createMenuItem(hq.token);
    await assignItem(hq.token, outlet.id, item.id);
    const url = `/api/v1/outlets/${outlet.id}/menu-items/${item.id}`;

    expect((await api().delete(url).set(auth(hq.token))).status).toBe(204);
    expect(await stockOf(outlet.id, item.id)).toBeUndefined();
    const again = await api().delete(url).set(auth(hq.token));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('NOT_ASSIGNED');

    await api()
      .patch(`/api/v1/menu-items/${item.id}`)
      .set(auth(hq.token))
      .send({ isActive: false });
    const inactive = await api().put(url).set(auth(hq.token)).send({});
    expect(inactive.status).toBe(422);
    expect(inactive.body.error.code).toBe('MENU_ITEM_INACTIVE');

    const unknown = await api()
      .put(`/api/v1/outlets/${outlet.id}/menu-items/00000000-0000-4000-8000-000000000000`)
      .set(auth(hq.token))
      .send({});
    expect(unknown.status).toBe(404);
  });
});
