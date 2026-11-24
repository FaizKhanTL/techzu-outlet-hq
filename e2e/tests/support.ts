import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

/** The demo accounts the stack seeds (SEED_DEMO_DATA=true). */
export const DEMO = {
  password: 'Password123!',
  hq: 'hq@example.com',
  orchard: 'orchard.staff@example.com',
  marina: 'marina.staff@example.com',
};

/** A value no earlier run used, so the tests can run again on the same database. */
export const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`.toUpperCase();

export async function signIn(page: Page, email: string, password = DEMO.password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** A thin client for setting up data through the API, so each test starts from exactly the state it needs. */
export class Api {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly token: string,
    readonly user: { id: string; outletId: string | null },
  ) {}

  // One sign-in per account per run: tokens last hours, and sign-ins are rate-limited.
  private static readonly sessions = new Map<
    string,
    { token: string; user: { id: string; outletId: string | null } }
  >();

  static async as(request: APIRequestContext, email: string) {
    let session = Api.sessions.get(email);
    if (!session) {
      const res = await request.post('/api/v1/auth/login', {
        data: { email, password: DEMO.password },
      });
      expect(res.status(), await res.text()).toBe(200);
      session = (await res.json()).data as {
        token: string;
        user: { id: string; outletId: string | null };
      };
      Api.sessions.set(email, session);
    }
    return new Api(request, session.token, session.user);
  }

  async call<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    data?: unknown,
    headers: Record<string, string> = {},
  ) {
    const res = await this.request.fetch(`/api/v1${path}`, {
      method,
      data,
      headers: { Authorization: `Bearer ${this.token}`, ...headers },
    });
    const body = res.status() === 204 ? undefined : await res.json();
    return {
      status: res.status(),
      body: body as { data: T; error?: { code: string; message: string } },
    };
  }

  async outletIdByCode(code: string) {
    const { body } = await this.call<{ id: string; code: string }[]>(
      'GET',
      `/outlets?search=${code}&limit=100`,
    );
    const outlet = body.data.find((row) => row.code === code);
    if (!outlet) throw new Error(`No outlet ${code}`);
    return outlet.id;
  }

  /** A new menu item on an outlet's menu, with stock. */
  async stockedItem(
    outletId: string,
    {
      name,
      basePriceCents = 1000,
      priceOverrideCents = null as number | null,
      stock = 5,
    }: {
      name: string;
      basePriceCents?: number;
      priceOverrideCents?: number | null;
      stock?: number;
    },
  ) {
    const created = await this.call<{ id: string; sku: string }>('POST', '/menu-items', {
      sku: unique('E2E'),
      name,
      category: 'E2E',
      basePriceCents,
    });
    expect(created.status).toBe(201);
    const item = created.body.data;
    expect(
      (await this.call('PUT', `/outlets/${outletId}/menu-items/${item.id}`, { priceOverrideCents }))
        .status,
    ).toBe(201);
    if (stock > 0) {
      const restock = await this.call(
        'POST',
        `/outlets/${outletId}/inventory/${item.id}/adjustments`,
        {
          quantityDelta: stock,
          reason: 'RESTOCK',
        },
      );
      expect(restock.status).toBe(201);
    }
    return item;
  }

  sell(outletId: string, items: { menuItemId: string; quantity: number }[]) {
    return this.call(
      'POST',
      `/outlets/${outletId}/sales`,
      { items, paymentMethod: 'CASH' },
      { 'Idempotency-Key': randomUUID() },
    );
  }
}

/** The POS tile of an item. */
export const tile = (page: Page, name: string) =>
  page.locator('button.tile').filter({ has: page.locator('.tile-name', { hasText: name }) });
