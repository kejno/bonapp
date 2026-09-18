import { expect, test } from '@playwright/test'

test('adds a configured dish and updates the cart counter', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /карбонара/i }).click()
  await page.getByRole('radio', { name: /тальятелле/i }).check()
  await page.getByRole('checkbox', { name: /дополнительный бекон/i }).check()
  await page.getByRole('button', { name: /добавить в заказ/i }).click()

  await expect(page.getByLabel('Корзина')).toHaveText('1')
})
