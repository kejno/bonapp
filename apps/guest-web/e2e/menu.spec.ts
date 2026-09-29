import { expect, test } from '@playwright/test'

test('opens the QR menu and filters dishes locally', async ({ page }) => {
  await page.route('**/api/v1/guest/session/qr-menu-token', async (route) => route.fulfill({
    json: {
      tenant: { id: 'tenant-1', name: 'Кафе Bonapp', currency: 'BYN', logoUrl: null },
      table: { tableNumber: 7, areaName: 'Основной зал' },
    },
  }))
  await page.route('**/api/v1/guest/menu', async (route) => {
    expect(route.request().headers()['x-qr-token']).toBe('qr-menu-token')
    await route.fulfill({
      json: [{
        id: 'drinks',
        name: 'Напитки',
        items: [
          { id: 'coffee', name: 'Капучино', description: 'Кофе с молоком', priceByn: '8.50', imageUrl: null, isHit: true, isInStopList: false, modifierGroups: [] },
          { id: 'tea', name: 'Чёрный чай', description: 'Листовой чай', priceByn: '4.00', imageUrl: null, isHit: false, isInStopList: true, modifierGroups: [] },
        ],
      }],
    })
  })

  await page.goto('/?qr_token=qr-menu-token')

  await expect(page.getByText('Стол №7')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Напитки' })).toBeVisible()
  await expect(page.getByText('Капучино')).toBeVisible()
  await expect(page.getByText('Нет в наличии')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Чёрный чай' }).getByRole('button', { name: 'Добавить' })).toBeDisabled()

  await page.getByRole('textbox', { name: 'Поиск по меню' }).fill('листовой')
  await expect(page.getByText('Чёрный чай')).toBeVisible()
  await expect(page.getByText('Капучино')).toBeHidden()
})
