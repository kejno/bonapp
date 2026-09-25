import { expect, test } from '@playwright/test';

test('redirects to the dashboard after a successful login', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          role: 'OWNER',
          tenantId: 'tenant-1',
          fullName: 'Admin',
        },
      }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Войти' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole('heading', { name: 'Добро пожаловать, Admin' }),
  ).toBeVisible();
});
