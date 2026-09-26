import { expect, test } from '@playwright/test';

test('previews a brand color change and saves tenant settings', async ({ page }) => {
  let savedSettings: Record<string, unknown> | null = null;
  await page.route('**/api/v1/auth/login', (route) => route.fulfill({ json: {
    accessToken: 'settings-token', user: { id: 'user-1', email: 'owner@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Owner' },
  } }));
  await page.route('**/api/v1/admin/tenant/settings', async (route) => {
    if (route.request().method() === 'PUT') savedSettings = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ json: {
      name: 'Кафе', slug: 'cafe', address: 'Минск', unp: '123', legalName: 'ООО Кафе', logoUrl: null,
      brandColor: (savedSettings?.['brandColor'] as string | undefined) ?? '#e0533c',
      serviceMode: (savedSettings?.['serviceMode'] as string | undefined) ?? 'ORDER_AND_PAY',
    } });
  });
  await page.goto('/login');
  await page.getByLabel('Email или телефон').fill('owner@example.com');
  await page.getByLabel('Пароль').fill('secret-password');
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('link', { name: 'Настройки заведения' }).click();

  const preview = page.getByLabel('Предпросмотр меню');
  await expect(preview).toBeVisible();
  await page.getByLabel('Цвет бренда').fill('#123456');
  await expect(preview).toHaveCSS('border-color', 'rgb(18, 52, 86)');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('status')).toHaveText('Настройки сохранены');
  expect(savedSettings?.['brandColor']).toBe('#123456');
});
