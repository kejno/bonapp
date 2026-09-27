import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'
import { getKdsOrders } from './kds.api'

vi.mock('./kds.api', () => ({
  getKdsOrders: vi.fn(),
  updateKdsStatus: vi.fn(),
  kdsSocketUrl: 'http://localhost:3000',
}))

const orders = [
  { id: 'hot-order', dailyOrderNumber: 48, status: 'NEW', createdAt: new Date().toISOString(), table: { tableNumber: 2, label: '2' }, assignedWaiter: null, items: [{ id: 'hot-item', itemId: 'dish-1', name: 'Суп', quantity: 1, status: 'NEW', kitchenDepartment: 'HOT', itemComment: null }] },
  { id: 'bar-order', dailyOrderNumber: 49, status: 'NEW', createdAt: new Date().toISOString(), table: { tableNumber: 3, label: '3' }, assignedWaiter: null, items: [{ id: 'bar-item', itemId: 'dish-2', name: 'Лимонад', quantity: 1, status: 'NEW', kitchenDepartment: 'BAR', itemComment: null }] },
]

afterEach(cleanup)

describe('BNP-418: фильтр цеха Live KDS', () => {
  it('оставляет в списке позиции выбранного цеха', async () => {
    vi.mocked(getKdsOrders).mockResolvedValue({ orders, departments: ['HOT', 'BAR'] })
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider>)

    expect(await screen.findByText(/Суп/)).toBeInTheDocument()
    expect(screen.getByText(/Лимонад/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Фильтр по цеху' }), { target: { value: 'HOT' } })

    expect(screen.getByText(/Суп/)).toBeInTheDocument()
    expect(screen.queryByText(/Лимонад/)).not.toBeInTheDocument()
  })
})
