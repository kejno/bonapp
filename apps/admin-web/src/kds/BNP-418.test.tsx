import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'
import { getKdsOrders, updateKdsStatus } from './kds.api'

vi.mock('./kds.api', () => ({
  getKdsOrders: vi.fn(),
  updateKdsStatus: vi.fn(),
  kdsSocketUrl: 'http://localhost:3000',
}))

const orders = [
  { id: 'hot-order', dailyOrderNumber: 48, status: 'NEW', createdAt: new Date().toISOString(), table: { tableNumber: 2, label: '2' }, assignedWaiter: null, items: [{ id: 'hot-item', itemId: 'dish-1', name: 'Суп', quantity: 1, status: 'NEW', kitchenDepartment: 'HOT', itemComment: null }] },
  { id: 'cold-order', dailyOrderNumber: 49, status: 'COOKING', createdAt: new Date().toISOString(), table: { tableNumber: 3, label: '3' }, assignedWaiter: null, items: [{ id: 'cold-item', itemId: 'dish-2', name: 'Салат', quantity: 1, status: 'COOKING', kitchenDepartment: 'COLD', itemComment: null }] },
  { id: 'bar-order', dailyOrderNumber: 50, status: 'SERVED', createdAt: new Date().toISOString(), table: { tableNumber: 4, label: '4' }, assignedWaiter: null, items: [{ id: 'bar-item', itemId: 'dish-3', name: 'Лимонад', quantity: 1, status: 'SERVED', kitchenDepartment: 'BAR', itemComment: null }] },
]

afterEach(cleanup)

describe('BNP-418: фильтр цеха Live KDS', () => {
  it('фильтрует позиции по каждому цеху, возвращает все позиции и не меняет статусы заказов', async () => {
    vi.mocked(getKdsOrders).mockResolvedValue({ orders, departments: ['HOT', 'COLD', 'BAR'] })
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider>)

    expect(await screen.findByText(/Суп/)).toBeInTheDocument()
    expect(screen.getByText(/Салат/)).toBeInTheDocument()
    expect(screen.getByText(/Лимонад/)).toBeInTheDocument()
    const filter = screen.getByRole('combobox', { name: 'Фильтр по цеху' })

    fireEvent.change(filter, { target: { value: 'HOT' } })
    expect(screen.getByText(/Суп/)).toBeInTheDocument()
    expect(screen.queryByText(/Салат/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Лимонад/)).not.toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'COLD' } })
    expect(screen.queryByText(/Суп/)).not.toBeInTheDocument()
    expect(screen.getByText(/Салат/)).toBeInTheDocument()
    expect(screen.queryByText(/Лимонад/)).not.toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'BAR' } })
    expect(screen.queryByText(/Суп/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Салат/)).not.toBeInTheDocument()
    expect(screen.getByText(/Лимонад/)).toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'ALL' } })
    expect(screen.getByText(/Суп/)).toBeInTheDocument()
    expect(screen.getByText(/Салат/)).toBeInTheDocument()
    expect(screen.getByText(/Лимонад/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Новые' })).toContainElement(screen.getByText(/Суп/))
    expect(screen.getByRole('region', { name: 'Готовятся' })).toContainElement(screen.getByText(/Салат/))
    expect(screen.getByRole('region', { name: 'Поданы' })).toContainElement(screen.getByText(/Лимонад/))
    expect(updateKdsStatus).not.toHaveBeenCalled()
  })
})
