import { test, expect, type Page } from '@playwright/test'
import type { StaffMemberDto, ShiftDto, CloseShiftResultDto } from '@bonapp/shared-types'

const BASE_MEMBER: StaffMemberDto = {
  id: 'staff-1',
  name: 'Иван Петров',
  role: 'WAITER',
  phone: '+375291112233',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-09-17T00:00:00.000Z',
}

const OPEN_SHIFT: ShiftDto = {
  id: 'shift-1',
  openedAt: '2026-09-17T08:00:00.000Z',
  closedAt: null,
  cashier: { id: 'staff-1', name: 'Иван Петров' },
  ordersCount: 3,
}

const CLOSE_RESULT: CloseShiftResultDto = {
  id: 'shift-1',
  openedAt: '2026-09-17T08:00:00.000Z',
  closedAt: '2026-09-17T20:00:00.000Z',
  cashier: { id: 'staff-1', name: 'Иван Петров' },
  ordersCount: 3,
  totalRevenue: 127.5,
}

async function mockNoShift(page: Page) {
  await page.route('/api/shifts/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  )
}

async function mockOpenShift(page: Page) {
  await page.route('/api/shifts/current', (route) =>
    route.fulfill({ json: OPEN_SHIFT }),
  )
}

test.describe('Staff page — add employee', () => {
  test('new employee appears in the table after adding', async ({ page }) => {
    const staff: StaffMemberDto[] = []

    await page.route('/api/staff', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: staff })
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        const newMember: StaffMemberDto = {
          id: 'new-1',
          name: body.name,
          role: body.role,
          phone: body.phone,
          isActive: true,
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
        }
        staff.push(newMember)
        await route.fulfill({ json: newMember })
      }
    })

    await mockNoShift(page)
    await page.goto('/staff')

    await expect(page.getByText('Сотрудники не добавлены')).toBeVisible()

    await page.getByRole('button', { name: 'Добавить' }).click()
    await expect(page.getByText('Добавить сотрудника')).toBeVisible()

    await page.getByLabel('Имя').fill('Мария Менеджер')
    await page.getByLabel('Роль').selectOption('MANAGER')
    await page.getByLabel('Телефон').fill('+375297778899')
    await page.getByLabel('Временный пароль').fill('secret123')

    await page.getByRole('button', { name: 'Сохранить' }).click()

    await expect(page.getByText('Мария Менеджер')).toBeVisible()
  })
})

test.describe('Staff page — deactivate employee', () => {
  test('deactivated employee shows "Неактивен" status', async ({ page }) => {
    const staff: StaffMemberDto[] = [{ ...BASE_MEMBER }]

    await page.route('/api/staff', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: staff })
      }
    })

    await page.route(`/api/staff/${BASE_MEMBER.id}/deactivate`, async (route) => {
      const deactivated = { ...BASE_MEMBER, isActive: false }
      staff[0] = deactivated
      await route.fulfill({ json: deactivated })
    })

    await mockNoShift(page)
    await page.goto('/staff')

    await expect(page.getByText('Иван Петров')).toBeVisible()
    await expect(page.getByText('Активен')).toBeVisible()

    await page.getByRole('button', { name: 'Деактивировать' }).click()

    await expect(page.getByText('Неактивен')).toBeVisible()
    await expect(page.queryByRole('button', { name: 'Деактивировать' })).not.toBeVisible()
  })
})

test.describe('Staff page — close shift', () => {
  test('shift shows as closed after closing', async ({ page }) => {
    let shiftOpen = true

    await page.route('/api/staff', (route) =>
      route.fulfill({ json: [BASE_MEMBER] }),
    )

    await page.route('/api/shifts/current', (route) =>
      route.fulfill({ json: shiftOpen ? OPEN_SHIFT : null }),
    )

    await page.route(`/api/shifts/${OPEN_SHIFT.id}/close`, async (route) => {
      shiftOpen = false
      await route.fulfill({ json: CLOSE_RESULT })
    })

    await page.goto('/staff')

    await expect(page.getByText('Иван Петров')).toBeVisible()
    await expect(page.getByText('Закрыть смену').first()).toBeVisible()

    await page.getByRole('button', { name: 'Закрыть смену' }).click()

    await expect(page.getByText('Закрыть смену?')).toBeVisible()
    await expect(page.getByText(/Открыто заказов: 3/)).toBeVisible()

    await page.getByRole('button', { name: 'Закрыть смену' }).last().click()

    await expect(page.getByText('Смена закрыта')).toBeVisible()
    await expect(page.getByText('127.50 BYN')).toBeVisible()
    await expect(page.getByText('3')).toBeVisible()

    await page.getByRole('button', { name: 'Готово' }).click()

    await expect(page.getByText('Смена не открыта')).toBeVisible()
  })
})
