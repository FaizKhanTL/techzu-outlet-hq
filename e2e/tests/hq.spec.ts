import { expect, test } from '@playwright/test';
import { Api, DEMO, signIn, tile, unique } from './support';

test.describe('HQ console', () => {
  test('HQ creates an item, assigns it to an outlet at its own price and stocks it; the outlet sells it', async ({
    page,
    browser,
    request,
  }) => {
    const sku = unique('E2E-UI');
    const name = `Iced ${sku}`;

    await signIn(page, DEMO.hq);
    await page.getByRole('link', { name: 'Master menu' }).click();
    await page.getByRole('button', { name: 'New item' }).click();
    const form = page.getByRole('dialog', { name: 'New menu item' });
    await form.getByLabel(/SKU/).fill(sku);
    await form.getByLabel('Name').fill(name);
    await form.getByLabel('Category').fill('E2E');
    await form.getByLabel('Master price').fill('12.5x');
    await expect(form.getByText('Enter an amount like 12.50')).toBeVisible();
    await expect(form.getByRole('button', { name: 'Save' })).toBeDisabled();
    await form.getByLabel('Master price').fill('12.50');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toBeHidden();
    await expect(page.locator('tr', { hasText: sku })).toContainText('12.50');

    await page.getByRole('link', { name: 'Outlets' }).click();
    await page.getByRole('link', { name: 'KLCC', exact: true }).click();
    await page.getByRole('button', { name: 'Assign menu item' }).click();
    const assign = page.getByRole('dialog', { name: 'Assign a menu item' });
    await assign.getByLabel('Menu item').selectOption({ label: `E2E · ${name} (12.50)` });
    await assign.getByLabel(/Outlet price/).fill('14');
    await assign.getByRole('button', { name: 'Assign' }).click();
    await expect(assign).toBeHidden();

    const row = page.locator('tr', { hasText: name });
    await expect(row).toContainText('14.00');
    await expect(row).toContainText('(override)');
    await row.getByRole('button', { name: 'Stock' }).click();
    const stock = page.getByRole('dialog', { name: `Stock of ${name}` });
    await stock.getByLabel('Quantity').fill('4');
    await expect(stock).toContainText('Stock after: 4');
    await stock.getByRole('button', { name: 'Save' }).click();
    await expect(stock).toBeHidden();
    await expect(row.locator('td').nth(3)).toHaveText('4');

    // The outlet's own staff, in a separate session, sell it at the outlet price.
    const staff = await browser.newPage();
    await signIn(staff, DEMO.klcc);
    await expect(tile(staff, name)).toContainText('14.00');
    await tile(staff, name).click();
    await staff.getByRole('button', { name: 'Charge' }).click();
    await expect(staff.getByRole('dialog', { name: 'Sale recorded' })).toContainText('14.00');
    await staff.close();

    await page.reload();
    await expect(page.locator('tr', { hasText: name }).locator('td').nth(3)).toHaveText('3');

    // The item can be paused from HQ, and the outlet price cleared back to the master price.
    const hq = await Api.as(request, DEMO.hq);
    const klcc = await hq.outletIdByCode('KLCC');
    const menu = await hq.call<{ name: string; menuItemId: string }[]>(
      'GET',
      `/outlets/${klcc}/menu-items`,
    );
    const assigned = menu.body.data.find((item) => item.name === name)!;
    await page.locator('tr', { hasText: name }).getByRole('button', { name: 'Price' }).click();
    const price = page.getByRole('dialog', { name: `Price of ${name}` });
    await price.getByLabel('Outlet price').fill('');
    await price.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('tr', { hasText: name })).toContainText('12.50');
    const after = await hq.call<{ priceOverrideCents: number | null }[]>(
      'GET',
      `/outlets/${klcc}/menu-items`,
    );
    expect(
      after.body.data.find(
        (item) => (item as unknown as { menuItemId: string }).menuItemId === assigned.menuItemId,
      ),
    ).toMatchObject({
      priceOverrideCents: null,
    });
  });

  test('HQ creates and deactivates an outlet', async ({ page }) => {
    const code = unique('E2').slice(0, 14);
    await signIn(page, DEMO.hq);
    await page.getByRole('link', { name: 'Outlets' }).click();
    await page.getByRole('button', { name: 'New outlet' }).click();
    const form = page.getByRole('dialog', { name: 'New outlet' });
    await form.getByLabel(/Code/).fill(code);
    await form.getByLabel('Name').fill(`E2E outlet ${code}`);
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form).toBeHidden();

    const row = page.locator('tr', { hasText: code });
    await expect(row).toContainText('Active');
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row).toContainText('Inactive');

    await page.getByRole('button', { name: 'New outlet' }).click();
    await form.getByLabel(/Code/).fill(code);
    await form.getByLabel('Name').fill('Duplicate');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('alert')).toContainText(
      `An outlet with code ${code} already exists.`,
    );
  });

  test('the dashboard reflects a new sale in revenue and in the outlet’s top items', async ({
    page,
    request,
  }) => {
    const hq = await Api.as(request, DEMO.hq);
    const pj = await hq.outletIdByCode('PJ');
    // One more than PJ's best seller so far, so it ranks first however many runs came before.
    const before = await hq.call<{ outlets: { items: { quantitySold: number }[] }[] }>(
      'GET',
      `/reports/top-items?outletId=${pj}&limit=1`,
    );
    const quantity = Number(before.body.data.outlets[0]?.items[0]?.quantitySold ?? 0) + 1;
    const name = unique('Bestseller');
    const item = await hq.stockedItem(pj, { name, basePriceCents: 100, stock: quantity });
    // A sale line holds at most 999 units.
    for (let left = quantity; left > 0; left -= 999) {
      const sale = await hq.sell(pj, [{ menuItemId: item.id, quantity: Math.min(left, 999) }]);
      expect(sale.status).toBe(201);
    }

    await signIn(page, DEMO.hq);
    const pjRow = page.locator('tbody tr', { hasText: 'Petaling Jaya' }).first();
    await expect(pjRow).toBeVisible();
    const pjCard = page.locator('section.card', {
      has: page.getByRole('heading', { name: /Petaling Jaya/ }),
    });
    await expect(pjCard.locator('tbody tr').first()).toContainText(name);
    await expect(pjCard.locator('tbody tr').first()).toContainText(String(quantity));

    // A date range before any sale shows nothing.
    await page.getByLabel('From').fill('2000-01-01');
    await page.getByLabel('To').fill('2000-01-02');
    await expect(page.locator('.kpi', { hasText: 'Sales' }).locator('strong')).toHaveText('0');
    await expect(page.locator('.kpi', { hasText: 'Items sold' }).locator('strong')).toHaveText('0');
  });
});
