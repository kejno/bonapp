import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useOrdersStore } from './ordersStore'

const socket = vi.hoisted(() => ({
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
}))

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    socket.connect.mockClear()
    socket.disconnect.mockClear()
    socket.emit.mockClear()
    socket.on.mockClear()
    useOrdersStore.setState({ orders: {} })
  })

  it('loads and displays the initial order snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          orderId: 'order-1',
          dailyOrderNumber: 48,
          status: 'NEW',
          estimatedReadyAt: null,
        }),
      }),
    )

    window.history.pushState({}, '', '/order/order-1/status')
    await act(async () => {
      render(<App />)
    })

    expect(await screen.findByText('Новый')).toBeInTheDocument()
    expect(screen.getByText('#048')).toBeInTheDocument()
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/orders/order-1'),
    )
  })

  it('replaces the status when a cancellation event arrives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          orderId: 'order-1',
          dailyOrderNumber: 48,
          status: 'PREPARING',
          estimatedReadyAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      }),
    )
    window.history.pushState({}, '', '/order/order-1/status')
    await act(async () => {
      render(<App />)
    })
    await screen.findByText('Готовится на кухне')

    const statusHandler = socket.on.mock.calls.find(
      ([event]) => event === 'order:status_changed',
    )?.[1] as (order: object) => void
    act(() => {
      statusHandler({
        orderId: 'order-1',
        dailyOrderNumber: 48,
        status: 'CANCELLED',
        estimatedReadyAt: null,
      })
    })

    expect(await screen.findByText('Заказ отменён')).toBeInTheDocument()
    expect(screen.getByText('Обратитесь к официанту')).toBeInTheDocument()
    expect(screen.queryByText('Добавить ещё')).not.toBeInTheDocument()
  })
})
