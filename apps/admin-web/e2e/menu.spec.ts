import { expect, test } from '@playwright/test';

test('creates a dish through the editor and shows it in the menu list', async ({ page }) => {
  let savedDish: { id: string; name: string; categoryId: string; price: number; isActive: boolean } | null = null;

  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        user: { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' },
      }),
    });
  });
  await page.route('**/api/v1/admin/menu/categories', (route) => route.fulfill({ json: [{ id: 'category-1', name: 'Основное' }] }));
  await page.route('**/api/v1/admin/menu/items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { id: 'item-1' } });
      return;
    }
    await route.fulfill({ json: savedDish ? [savedDish] : [] });
  });
  await page.route('**/api/v1/admin/menu/items/item-1', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON();
      savedDish = { id: 'item-1', name: payload.name, categoryId: payload.categoryId, price: payload.price, isActive: payload.isActive };
      await route.fulfill({ json: savedDish });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/admin/menu/items/item-1/modifier-groups', (route) => route.fulfill({ json: [] }));

  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.evaluate(() => { window.history.pushState({}, '', '/menu'); window.dispatchEvent(new PopStateEvent('popstate')); });

  await page.getByRole('heading', { name: 'Меню' }).waitFor();
  await page.getByRole('button', { name: 'Добавить блюдо' }).click();
  await page.getByRole('textbox', { name: 'Название' }).fill('Борщ');
  await page.getByRole('combobox', { name: 'Категория' }).selectOption('category-1');
  await page.getByLabel('Цена, BYN').fill('12');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Борщ' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '12.00 BYN' })).toBeVisible();
});

test('edits an existing dish and shows the updated values in the menu list', async ({ page }) => {
  let savedDish = { id: 'item-1', name: 'Борщ', categoryId: 'category-1', price: 1200, isActive: true };
  let updateRequestCount = 0;

  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        accessToken: 'test-access-token',
        user: { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' },
      }),
    });
  });
  await page.route('**/api/v1/admin/menu/categories', (route) => route.fulfill({ json: [{ id: 'category-1', name: 'Основное' }] }));
  await page.route('**/api/v1/admin/menu/items', (route) => route.fulfill({ json: [savedDish] }));
  await page.route('**/api/v1/admin/menu/items/item-1', async (route) => {
    if (route.request().method() === 'PUT') {
      updateRequestCount += 1;
      const payload = route.request().postDataJSON();
      savedDish = { ...savedDish, name: payload.name, categoryId: payload.categoryId, price: payload.price, isActive: payload.isActive };
      await route.fulfill({ json: savedDish });
      return;
    }
    await route.fulfill({ json: savedDish });
  });
  await page.route('**/api/v1/admin/menu/items/item-1/modifier-groups', (route) => route.fulfill({ json: [] }));

  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.evaluate(() => { window.history.pushState({}, '', '/menu'); window.dispatchEvent(new PopStateEvent('popstate')); });

  await page.getByRole('heading', { name: 'Меню' }).waitFor();
  await page.getByRole('button', { name: 'Редактировать' }).click();
  await page.getByRole('textbox', { name: 'Название' }).fill('Борщ домашний');
  await page.getByLabel('Цена, BYN').fill('13.5');
  await page.getByRole('button', { name: 'Сохранить' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Борщ домашний' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '13.50 BYN' })).toBeVisible();
  expect(updateRequestCount).toBe(1);
});
