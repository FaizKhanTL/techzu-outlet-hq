import { expect, test } from '@playwright/test';
import { Api, DEMO, signIn, tile, unique } from './support';

test.describe('outlet point of sale', () => {
  let hq: Api;
  let orchard: string;

  test.beforeEach(async ({ request }) => {
    hq = await Api.as(request, DEMO.hq);
    orchard = await hq.outletIdByCode('ORCHARD');
  });

  test('sells at the outlet price, prints a receipt and updates stock, history and inventory', async ({
    page,
  }) => {
    const name = unique('Flat White');
    await hq.stockedItem(orchard, {
      name,
      basePriceCents: 1100,
      priceOverrideCents: 1350,
      stock: 3,
    });

    await signIn(page, DEMO.orchard);
    await expect(tile(page, name)).toContainText('13.50');
    await expect(tile(page, name)).toContainText('3 left');
    await tile(page, name).click();
    await tile(page, name).click();
    await expect(page.locator('.cart-total')).toContainText('27.00');
    await page.getByRole('radio', { name: 'E-wallet' }).click();
    await page.getByRole('button', { name: 'Charge' }).click();

    const dialog = page.getByRole('dialog', { name: 'Sale recorded' });
    await expect(dialog).toBeVisible();
    const receipt = (await dialog.locator('.receipt-number').textContent())!;
    expect(receipt).toMatch(/^ORCHARD-\d{6}$/);
    await expect(dialog).toContainText(`2 × ${name}`);
    await dialog.getByRole('button', { name: 'New sale' }).click();
    await expect(tile(page, name)).toContainText('1 left');

    await page.getByRole('link', { name: 'Sales' }).click();
    const newest = page.locator('tbody tr.clickable').first();
    await expect(newest).toContainText(receipt);
    await expect(newest).toContainText('27.00');
    await newest.click();
    await expect(page.locator('tr.details')).toContainText(`2 × ${name}`);

    await page.getByRole('link', { name: 'Inventory' }).click();
    await expect(page.locator('tr', { hasText: name })).toContainText('1');
  });

  test('marks an item sold out when the last one is sold', async ({ page }) => {
    const name = unique('Last Croissant');
    await hq.stockedItem(orchard, { name, stock: 1 });
    await signIn(page, DEMO.orchard);
    await tile(page, name).click();
    await expect(tile(page, name)).toBeDisabled();
    await page.getByRole('button', { name: 'Charge' }).click();
    await page.getByRole('button', { name: 'New sale' }).click();
    await expect(tile(page, name)).toContainText('Sold out');
    await expect(tile(page, name)).toBeDisabled();
  });

  test('when another till sells the last one first, the sale is refused and the menu refreshes', async ({
    page,
  }) => {
    const name = unique('Contested Cake');
    const item = await hq.stockedItem(orchard, { name, stock: 1 });
    await signIn(page, DEMO.orchard);
    await tile(page, name).click();

    // Another terminal takes the last one while this cart is open.
    expect((await hq.sell(orchard, [{ menuItemId: item.id, quantity: 1 }])).status).toBe(201);

    await page.getByRole('button', { name: 'Charge' }).click();
    await expect(page.getByRole('alert')).toHaveText('Not enough stock for some items.');
    await expect(tile(page, name)).toContainText('Sold out');
  });

  test('a paused item disappears from the till and comes back when resumed', async ({ page }) => {
    const name = unique('Seasonal Tea');
    const item = await hq.stockedItem(orchard, { name, stock: 5 });
    await signIn(page, DEMO.orchard);
    await expect(tile(page, name)).toBeVisible();

    expect(
      (await hq.call('PATCH', `/outlets/${orchard}/menu-items/${item.id}`, { isAvailable: false }))
        .status,
    ).toBe(200);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Point of sale' })).toBeVisible();
    await expect(tile(page, name)).toHaveCount(0);

    expect(
      (await hq.call('PATCH', `/outlets/${orchard}/menu-items/${item.id}`, { isAvailable: true }))
        .status,
    ).toBe(200);
    await page.reload();
    await expect(tile(page, name)).toBeVisible();
  });

  test('another outlet does not see this outlet’s items', async ({ page }) => {
    const name = unique('Orchard Only');
    await hq.stockedItem(orchard, { name, stock: 5 });
    await signIn(page, DEMO.marina);
    await expect(page.getByRole('heading', { name: 'Point of sale' })).toBeVisible();
    await expect(page.locator('button.tile').first()).toBeVisible();
    await expect(tile(page, name)).toHaveCount(0);
  });
});
