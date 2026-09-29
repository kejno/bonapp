import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'

const order = {
  id: 'order-48',
  dailyOrderNumber: 48,
  status: 'COOKING',
  createdAt: new Date().toISOString(),
  table: { tableNumber: 2, label: '2' },
  assignedWaiter: null,
  items: [{ id: 'item-1', itemId: 'dish-1', name: 'Суп', quantity: 1, status: 'COOKING', kitchenDepartment: 'HOT', itemComment: null }],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('BNP-417: перемещение заказа в Live KDS', () => {
  it('отправляет PATCH и отображает заказ в колонке «Поданы» после успешного обновления', async () => {
    let currentStatus = 'COOKING'
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        currentStatus = JSON.parse(String(init.body)).status
        return new Response(JSON.stringify({ ...order, status: currentStatus }), { status: 200 })
      }

      return new Response(JSON.stringify({
        departments: ['HOT'],
        orders: [{ ...order, status: currentStatus }],
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider>)

    const card = await screen.findByRole('article')
    expect(screen.getByRole('region', { name: 'Готовятся' })).toContainElement(card)
    expect(screen.getByRole('region', { name: 'Поданы' })).not.toContainElement(card)
    fireEvent.dragStart(card)
    fireEvent.drop(screen.getByRole('region', { name: 'Поданы' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/orders/order-48/kds-status',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'SERVED' }),
        }),
      )
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method !== 'PATCH')).toHaveLength(2)
      expect(currentStatus).toBe('SERVED')
      expect(screen.getByRole('region', { name: 'Поданы' })).toContainElement(screen.getByRole('article'))
    })
    expect(screen.getByRole('region', { name: 'Готовятся' }).querySelector('article')).toBeNull()
  })
})
