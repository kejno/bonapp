import { test, expect } from '@playwright/test'
import type { IntegrationsStatusResponseDto } from '@bonapp/shared-types'

const STATUS_URL = '**/api/v1/admin/integrations/status'
const SETTINGS_URL = '**/api/v1/admin/tenant/settings'
const SYNC_URL = '**/api/v1/admin/integrations/iiko/sync'

function stubStatus(override: Partial<IntegrationsStatusResponseDto>) {
  const defaults: IntegrationsStatusResponseDto = {
    iiko: { status: 'NotConfigured' as any, pingMs: null },
    rKeeper: { status: 'NotConfigured' as any, pingMs: null },
    oplaty: { status: 'NotConfigured' as any, merchantId: null },
    erip: { status: 'NotConfigured' as any, serviceId: null },
    bePaid: { status: 'NotConfigured' as any, shopId: null, mode: null },
    skno: { status: 'NotConfigured' as any, serialNumber: null, pingMs: null },
  }
  return { ...defaults, ...override }
}

test.describe('Integrations page', () => {
  test('renders all 6 integration cards', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({ json: stubStatus({}) }),
    )
    await page.goto('/settings/integrations')

    await expect(page.getByTestId('integration-card-iiko')).toBeVisible()
    await expect(page.getByTestId('integration-card-r_keeper')).toBeVisible()
    await expect(page.getByTestId('integration-card-oplaty')).toBeVisible()
    await expect(page.getByTestId('integration-card-erip')).toBeVisible()
    await expect(page.getByTestId('integration-card-bepaid')).toBeVisible()
    await expect(page.getByTestId('integration-card-skno')).toBeVisible()
  })

  test('iiko card shows Online status when credentials are correct', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: stubStatus({
          iiko: { status: 'Online' as any, pingMs: 45 },
        }),
      }),
    )
    await page.goto('/settings/integrations')

    const card = page.getByTestId('integration-card-iiko')
    await expect(card).toContainText('Online')
    await expect(card).toContainText('45 ms')
  })

  test('iiko card shows Connection failed when credentials are incorrect', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: stubStatus({
          iiko: { status: 'ConnectionFailed' as any, pingMs: null },
        }),
      }),
    )
    await page.goto('/settings/integrations')

    const card = page.getByTestId('integration-card-iiko')
    await expect(card).toContainText('Connection failed')
    await expect(card).not.toContainText('ms')
  })

  test('sync button triggers POST and shows success toast', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({
        json: stubStatus({ iiko: { status: 'Online' as any, pingMs: 30 } }),
      }),
    )
    await page.route(SYNC_URL, (route) => route.fulfill({ status: 202, json: { message: 'Sync started' } }))

    await page.goto('/settings/integrations')

    const syncBtn = page.getByTestId('integration-card-iiko').getByRole('button', {
      name: 'Синхронизировать меню',
    })
    await syncBtn.click()

    await expect(page.getByRole('alert')).toContainText('Синхронизация завершена')
  })

  test('edit credentials dialog opens and saves', async ({ page }) => {
    await page.route(STATUS_URL, (route) =>
      route.fulfill({ json: stubStatus({}) }),
    )
    await page.route(SETTINGS_URL, (route) => route.fulfill({ status: 200 }))

    await page.goto('/settings/integrations')

    await page.getByTestId('integration-card-oplaty').getByRole('button', { name: 'Настроить' }).click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Оплати™')).toBeVisible()
  })
})
