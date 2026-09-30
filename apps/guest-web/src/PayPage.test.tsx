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

  it('shows the E-POS values, QR code and all five approved ERIP steps', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/pay/card/status')) return { ok: true, json: async () => ({ paymentEnabled: false }) } as Response
      if (url.endsWith('/pay/erip/status')) return { ok: true, json: async () => ({ paymentEnabled: true }) } as Response
      if (url.endsWith('/pay/erip')) return { ok: true, json: async () => ({ serviceNo: 12345678, accountNumber: '000000000042', qrCode: 'png-base64', instruction: [] }) } as Response
      return { ok: true, json: async () => ({ id: 'order-1', totalAmountByn: 25 }) } as Response
    })

    render(<PayPage orderId="order-1" />)
    await screen.findByText('К оплате: 25.00 BYN')
    await act(async () => { screen.getByRole('tab', { name: 'ЕРИП' }).click(); await Promise.resolve() })

    expect(await screen.findByText('12345678')).toBeInTheDocument()
    expect(screen.getByText('000000000042')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'QR-код для оплаты через ЕРИП' })).toHaveAttribute('src', 'data:image/png;base64,png-base64')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('Дождитесь подтверждения на этой странице: после оплаты заказ закроется автоматически.')).toBeInTheDocument()
  })
})
