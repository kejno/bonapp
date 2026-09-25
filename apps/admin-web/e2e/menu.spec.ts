import { expect, test } from '@playwright/test';

test('updates stop-list state in the menu without reloading', async ({ page }) => {
  let isInStopList = false;
  await page.route('**/api/v1/auth/login', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ accessToken: 'test-access-token', user: {
      id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin',
    } }),
  }));
  await page.route('**/api/v1/admin/menu/categories', async (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify([{ id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true }]),
  }));
  await page.route('**/api/v1/admin/menu/items', async (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify([{ id: 'item-1', name: 'Кофе', categoryId: 'cat-1', price: 450, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList }]),
  }));
  await page.route('**/api/v1/admin/menu/items/item-1/stop-list', async (route) => {
    isInStopList = (route.request().postDataJSON() as { isInStopList: boolean }).isInStopList;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ id: 'item-1', isInStopList }) });
  });

  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Каталог меню' }).click();
  await expect(page.getByRole('button', { name: 'Напитки' })).toBeVisible();
  await page.getByRole('button', { name: 'Напитки' }).click();

  const stopListSwitch = page.getByRole('switch', { name: '86 Стоп-лист: Кофе' });
  await expect(stopListSwitch).toHaveAttribute('aria-checked', 'false');
  await stopListSwitch.click();
  await expect(stopListSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Кофе')).toBeVisible();
});
