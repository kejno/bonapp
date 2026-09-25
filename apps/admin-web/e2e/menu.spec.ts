import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ accessToken: 'test-access-token', user: {
      id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin',
    } }),
  }));
  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('admin@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.evaluate(() => { window.history.pushState({}, '', '/menu'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('heading', { name: 'Блюда' }).waitFor();
}

test('updates stop-list state in the menu without reloading', async ({ page }) => {
  let isInStopList = false;
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

  await signIn(page);
  await expect(page.getByRole('button', { name: 'Напитки' })).toBeVisible();
  await page.getByRole('button', { name: 'Напитки' }).click();
  let documentLoads = 0;
  page.on('load', () => { documentLoads += 1; });
  const stopListSwitch = page.getByRole('switch', { name: '86 Стоп-лист: Кофе' });
  await expect(stopListSwitch).toHaveAttribute('aria-checked', 'false');
  await stopListSwitch.click();
  await expect(stopListSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Кофе')).toBeVisible();
  expect(documentLoads).toBe(0);
});

test('creates a dish through the editor and shows it in the menu list', async ({ page }) => {
  let savedDish: { id: string; name: string; categoryId: string; price: number; isActive: boolean; isInStopList: boolean } | null = null;
  await page.route('**/api/v1/admin/menu/categories', (route) => route.fulfill({ json: [{ id: 'category-1', name: 'Основное', sortOrder: 0, isVisible: true }] }));
  await page.route('**/api/v1/admin/menu/items', async (route) => {
    if (route.request().method() === 'POST') {
      const payload = route.request().postDataJSON();
      savedDish = { id: 'item-1', name: payload.name, categoryId: payload.categoryId, price: payload.price, isActive: true, isInStopList: false };
    }
    await route.fulfill({ json: savedDish ? [savedDish] : [] });
  });

  await signIn(page);
  await page.getByRole('button', { name: '+ Добавить блюдо' }).click();
  await page.getByRole('textbox', { name: 'Название' }).fill('Борщ');
  await page.getByRole('combobox', { name: 'Категория' }).selectOption('category-1');
  await page.getByLabel('Цена, BYN').fill('12');
  await page.getByRole('button', { name: 'Добавить блюдо' }).last().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Борщ', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '12.00 BYN' })).toBeVisible();
});

test('edits an existing dish and shows the updated values in the menu list', async ({ page }) => {
  let savedDish = { id: 'item-1', name: 'Борщ', categoryId: 'category-1', price: 1200, isActive: true, isInStopList: false };
  let updateRequestCount = 0;
  await page.route('**/api/v1/admin/menu/categories', (route) => route.fulfill({ json: [{ id: 'category-1', name: 'Основное', sortOrder: 0, isVisible: true }] }));
  await page.route('**/api/v1/admin/menu/items', (route) => route.fulfill({ json: [savedDish] }));
  await page.route('**/api/v1/admin/menu/items/item-1', async (route) => {
    if (route.request().method() === 'PUT') {
      updateRequestCount += 1;
      const payload = route.request().postDataJSON();
      savedDish = { ...savedDish, name: payload.name, categoryId: payload.categoryId, price: payload.price };
    }
    await route.fulfill({ json: savedDish });
  });

  await signIn(page);
  await page.getByRole('button', { name: 'Борщ' }).click();
  await page.getByRole('textbox', { name: 'Название' }).fill('Борщ домашний');
  await page.getByLabel('Цена, BYN').fill('13.5');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Борщ домашний', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '13.50 BYN' })).toBeVisible();
  expect(updateRequestCount).toBe(1);
});
