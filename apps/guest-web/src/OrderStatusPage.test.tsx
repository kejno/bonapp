import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OrderStatusPage from './OrderStatusPage'

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
})

describe('OrderStatusPage', () => {
  it('loads and displays the order snapshot and its daily number', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', estimatedReadyAt: null }),
    } as Response)

    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Заказ #048')).toBeInTheDocument()
    expect(screen.getByText('Готовится на кухне')).toBeInTheDocument()
  })

  it('shows cancellation guidance and removes the reorder action for cancelled orders', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'CANCELLED', estimatedReadyAt: null }),
    } as Response)

    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Заказ отменён')).toBeInTheDocument()
    expect(screen.getByText('Обратитесь к официанту')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Добавить ещё' })).not.toBeInTheDocument()
  })
})
