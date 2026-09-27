import { expect, test } from '@playwright/test'

test('opens a table QR route and shows the restaurant and table number', async ({ page }) => {
  await page.route('**/api/v1/guest/session/e2e-token', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        tenant: {
          id: 'tenant-e2e',
          name: 'Ресторан Тест',
          brandColor: '#245678',
          logoUrl: null,
          currency: 'BYN',
        },
        table: { id: 'table-e2e', tableNumber: 12, areaName: 'Основной зал' },
        activeOrder: null,
      }),
    })
  })
  await page.route('**/api/v1/guest/tenant/config?tenantId=tenant-e2e', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ logoUrl: null, brandColor: '#245678', serviceMode: 'ORDER_AND_PAY' }),
    })
  })
  await page.route('**/api/v1/guest/menu', async (route) => {
    expect(route.request().headers()['x-qr-token']).toBe('e2e-token')
    await route.fulfill({ contentType: 'application/json', body: '[]' })
  })

  await page.goto('/t/e2e-token')

  await expect(page.getByText('Ресторан Тест')).toBeVisible()
  await expect(page.getByText('Стол №12')).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('--color-primary', '#245678')
})
