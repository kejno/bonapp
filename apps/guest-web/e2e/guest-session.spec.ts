import { expect, test } from '@playwright/test'

test('shows the venue name and table number for a valid QR token', async ({ page }) => {
  await page.route('**/api/v1/guest/session/table-token', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        tenantId: 'tenant-1',
        tableId: 'table-1',
        tableNumber: '7',
        brandColor: '#123456',
        logoUrl: null,
        tenantName: 'Bonapp Cafe',
      }),
    })
  })

  await page.goto('/t/table-token')

  await expect(page.getByText('Bonapp Cafe')).toBeVisible()
  await expect(page.getByText('Стол №7')).toBeVisible()
})
