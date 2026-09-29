import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PayPage from './PayPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('PayPage', () => {
  it('shows only the amount charged while tips are not supported', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', totalAmountByn: 100 }),
    } as Response)

    render(<PayPage orderId="order-1" />)

    expect(await screen.findByText('Сумма заказа: 100.00 BYN')).toBeInTheDocument()
    expect(screen.queryByText('Чаевые')).not.toBeInTheDocument()
    expect(screen.getByText('К оплате: 100.00 BYN')).toBeInTheDocument()
  })

  it('stops waiting after the checkout session limit and offers another attempt', async () => {
    vi.useFakeTimers()
    window.sessionStorage.setItem('qrToken', 'table-token')
    window.history.replaceState({}, '', '/order/order-1/pay?result=success')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => ({
      ok: true,
      json: async () => String(input).includes('/status')
        ? { paymentStatus: 'PENDING', orderStatus: 'SERVED', paymentEnabled: true }
        : { id: 'order-1', totalAmountByn: 100 },
    } as Response))
    render(<PayPage orderId="order-1" />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60_000) })
    expect(screen.getByText('Время оплаты истекло')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Повторить оплату' })).toBeInTheDocument()
    vi.useRealTimers()
  })
})
