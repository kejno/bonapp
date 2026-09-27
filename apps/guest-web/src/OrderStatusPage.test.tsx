import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OrderStatusPage from './OrderStatusPage'
import { useOrdersStore } from './orders/orders.store'

const { socket } = vi.hoisted(() => ({ socket: { handlers: new Map<string, (payload?: unknown) => void>(), on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() } }))
vi.mock('socket.io-client', () => ({ io: () => socket }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  useOrdersStore.setState({ order: null })
})

describe('OrderStatusPage', () => {
  it('loads and displays the order snapshot and its daily number', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', estimatedReadyAt: null, updatedAt: '2026-09-26T12:00:00.000Z' }),
    } as Response)

    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Заказ #048')).toBeInTheDocument()
    expect(screen.getByText('Готовится на кухне')).toBeInTheDocument()
  })

  it('loads the order when opened directly with the QR token in the URL', async () => {
    window.history.replaceState({}, '', '/order/order-1/status?qr_token=url-table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'NEW', estimatedReadyAt: null, updatedAt: '2026-09-26T12:00:00.000Z' }),
    } as Response)

    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Заказ #048')).toBeInTheDocument()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/guest/orders/order-1'),
      { headers: { 'X-QR-Token': 'url-table-token' } },
    )
  })

  it('shows cancellation guidance and removes the reorder action for cancelled orders', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'CANCELLED', estimatedReadyAt: null, updatedAt: '2026-09-26T12:00:00.000Z' }),
    } as Response)

    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Заказ отменён')).toBeInTheDocument()
    expect(screen.getByText('Обратитесь к официанту')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Добавить ещё' })).not.toBeInTheDocument()
  })

  it('refreshes the order after joining the room to cover status changes during subscription', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'COOKING', estimatedReadyAt: null, updatedAt: '2026-09-26T12:00:00.000Z' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'order-1', dailyOrderNumber: 48, status: 'READY', estimatedReadyAt: null, updatedAt: '2026-09-26T12:01:00.000Z' }),
      } as Response)
    socket.on.mockImplementation((event: string, handler: (payload?: unknown) => void) => {
      socket.handlers.set(event, handler)
      return socket
    })
    render(<OrderStatusPage orderId="order-1" />)

    expect(await screen.findByText('Готовится на кухне')).toBeInTheDocument()
    socket.handlers.get('connect')?.()
    const ack = socket.emit.mock.calls.at(-1)?.[2] as (result: { ok: boolean }) => void
    ack({ ok: true })
    expect(await screen.findByText('Готово — зовите официанта')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})
