import { expect, test } from '@playwright/test';
import { DEMO, signIn } from './support';

test.describe('sign-in and access', () => {
  test('a signed-out visitor is sent to sign in, then back to the page they wanted', async ({
    page,
  }) => {
    await page.goto('/outlet/inventory');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(DEMO.orchard);
    await page.getByLabel('Password').fill(DEMO.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/outlet\/inventory$/);
    await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });

  test('a wrong password shows the error and stays on the sign-in page', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(DEMO.hq);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('each role lands on its own home and is kept out of the other one', async ({ page }) => {
    await signIn(page, DEMO.orchard);
    await expect(page).toHaveURL(/\/outlet\/pos$/);
    await page.goto('/hq/menu');
    await expect(page).toHaveURL(/\/outlet\/pos$/);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await signIn(page, DEMO.hq);
    await expect(page).toHaveURL(/\/hq$/);
    await page.goto('/outlet/sales');
    await expect(page).toHaveURL(/\/hq$/);
  });

  test('the session survives a reload and ends on sign-out', async ({ page }) => {
    await signIn(page, DEMO.orchard);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Point of sale' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/outlet/pos');
    await expect(page).toHaveURL(/\/login$/);
  });
});
