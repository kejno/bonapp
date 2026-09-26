import { expect, test } from '@playwright/test'

test('adds a dish with a modifier and increments the cart counter', async ({ page }) => {
  await page.route('**/api/v1/guest/session/test-token', (route) => route.fulfill({ json: {
    tenant: { id: 'tenant-1', name: 'Тестовый ресторан', currency: 'BYN' },
    table: { tableNumber: 5, areaName: 'Зал' }, activeOrder: null,
  } }))
  await page.route('**/api/v1/guest/menu?tenantId=tenant-1', (route) => route.fulfill({ json: [{
    id: 'category-1', name: 'Пицца', items: [{ id: 'pizza-1', name: 'Маргарита', priceByn: 20, modifierGroups: [{ modifierGroup: {
      id: 'size', name: 'Размер', isRequired: true, minSelection: 1, maxSelection: 1,
      modifiers: [{ id: 'large', name: 'Большая', price: '2.50' }],
    } }],
  }],
  }] }))

  await page.goto('/?qr_token=test-token')
  await page.getByRole('button', { name: /Маргарита/ }).click()
  await page.getByLabel('Большая').check()
  await page.getByRole('button', { name: /Добавить в заказ · 22.50 BYN/ }).click()
  await expect(page.getByLabel('Количество товаров в корзине')).toHaveText('Корзина · 1')
})
