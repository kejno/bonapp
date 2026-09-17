import { test, expect } from '@playwright/test';

const METRICS_MOCK = {
  mrr: 5000,
  activeTenants: 8,
  ordersToday: 30,
  mrrHistory: Array.from({ length: 12 }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, mrr: 1000 + i * 100 })),
};

const TENANTS_MOCK = {
  data: [
    {
      id: 'tid-1',
      name: 'Тестовый ресторан',
      plan: 'PRO',
      status: 'ACTIVE',
      trialEndsAt: null,
      revenueLastThirtyDays: 250,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  total: 1,
};

async function setRole(page: import('@playwright/test').Page, role: string) {
  await page.goto('/');
  await page.evaluate((r) => {
    localStorage.setItem('bonapp-auth', JSON.stringify({ state: { role: r }, version: 0 }));
  }, role);
}

test.describe('SuperAdmin Console', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/superadmin/metrics', (route) =>
      route.fulfill({ json: METRICS_MOCK }),
    );
    await page.route('/api/superadmin/tenants**', (route) =>
      route.fulfill({ json: TENANTS_MOCK }),
    );
  });

  test('SUPER_ADMIN sees /superadmin page', async ({ page }) => {
    await setRole(page, 'SUPER_ADMIN');
    await page.goto('/superadmin');

    await expect(page.getByRole('heading', { name: 'Суперадмин консоль' })).toBeVisible();
    await expect(page.getByText('MRR (BYN)')).toBeVisible();
    await expect(page.getByText('Активные рестораны')).toBeVisible();
    await expect(page.getByText('QR-заказы сегодня')).toBeVisible();
  });

  test('SUPER_ADMIN sees tenant table with data', async ({ page }) => {
    await setRole(page, 'SUPER_ADMIN');
    await page.goto('/superadmin');

    await expect(page.getByText('Тестовый ресторан')).toBeVisible();
  });

  test('OWNER is redirected to /403 when accessing /superadmin', async ({ page }) => {
    await setRole(page, 'OWNER');
    await page.goto('/superadmin');

    await expect(page).toHaveURL('/403');
    await expect(page.getByText('403 — Доступ запрещён')).toBeVisible();
  });

  test('unauthenticated user is redirected to /403', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('bonapp-auth'));
    await page.goto('/superadmin');

    await expect(page).toHaveURL('/403');
  });
});
