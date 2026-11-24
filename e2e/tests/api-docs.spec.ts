import { expect, test } from '@playwright/test';

test.describe('API documentation', () => {
  test('Swagger UI renders every operation and can call the API', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto('/api/docs');
    await expect(page).toHaveURL(/\/api\/docs\/$/);
    await expect(page.locator('.info .title')).toContainText('Outlet HQ API');
    await expect(page.locator('.opblock')).toHaveCount(24);

    // Try it out: sign in with the documented example body, against this same server.
    const login = page.locator('#operations-Auth-login');
    await login.locator('.opblock-summary').click();
    await login.getByRole('button', { name: 'Try it out' }).click();
    await login.getByRole('button', { name: 'Execute' }).click();
    await expect(login.locator('.live-responses-table tbody .response-col_status')).toHaveText(
      '200',
    );
    await expect(login.locator('.live-responses-table')).toContainText('"tokenType": "Bearer"');

    // No blocked scripts or styles (the API's Content-Security-Policy applies to this page).
    expect(problems).toEqual([]);
  });
});
