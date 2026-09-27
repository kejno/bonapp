import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import KdsPage from './KdsPage'

vi.mock('../orders/orders.api', () => ({
  getOrders: vi.fn().mockResolvedValue([
    { id: 'test-order', dailyOrderNumber: 12, status: 'NEW', totalAmountByn: 8, createdAt: '2026-09-26T12:00:00Z', isTest: true },
    { id: 'paid-order', dailyOrderNumber: 11, status: 'PAID', totalAmountByn: 5, createdAt: '2026-09-26T11:00:00Z', isTest: false },
  ]),
}))

afterEach(cleanup)

describe('KdsPage', () => {
  it('shows active orders and marks test orders while hiding completed orders', async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><KdsPage /></QueryClientProvider></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Заказ №12' })).toBeInTheDocument()
    expect(screen.getByText('Тестовый')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Заказ №11' })).not.toBeInTheDocument()
  })
})
