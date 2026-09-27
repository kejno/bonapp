import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'
import { getKdsOrders, updateKdsStatus } from './kds.api'

vi.mock('./kds.api', () => ({ getKdsOrders: vi.fn(), updateKdsStatus: vi.fn(), kdsSocketUrl: 'http://localhost:3000' }))

afterEach(cleanup)

describe('BNP-416: кнопка Bump в Live KDS', () => {
  it('переводит заказ из «Новые» в «Готовятся»', async () => {
    vi.mocked(getKdsOrders).mockResolvedValue({
      departments: ['HOT'],
      orders: [{ id: 'order-48', dailyOrderNumber: 48, status: 'NEW', createdAt: new Date().toISOString(), table: { tableNumber: 2, label: '2' }, assignedWaiter: null, items: [{ id: 'item-1', itemId: 'dish-1', name: 'Суп', quantity: 1, status: 'NEW', kitchenDepartment: 'HOT', itemComment: null }] }],
    })
    vi.mocked(updateKdsStatus).mockResolvedValue({} as Awaited<ReturnType<typeof getKdsOrders>>['orders'][number])
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider>)

    fireEvent.click(await screen.findByRole('button', { name: 'Bump' }))

    await waitFor(() => expect(updateKdsStatus).toHaveBeenCalledWith('order-48', 'COOKING', 'HOT'))
  })
})
