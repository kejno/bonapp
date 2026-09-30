import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('recalculates total for preset and custom tips', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/pay/card/status')) return { ok: true, json: async () => ({ paymentEnabled: true }) } as Response
      if (url.endsWith('/pay/erip/status')) return { ok: true, json: async () => ({ paymentEnabled: false }) } as Response
      if (url.endsWith('/pay/card')) return { ok: true, json: async () => ({ redirectUrl: 'https://payment.example/checkout' }) } as Response
      return { ok: true, json: async () => ({ id: 'order-1', totalAmountByn: 100 }) } as Response
    })

    render(<PayPage orderId="order-1" />)

    expect(await screen.findByText('Сумма заказа: 100.00 BYN')).toBeInTheDocument()
    for (const [percent, tip, total] of [[0, '0.00', '100.00'], [5, '5.00', '105.00'], [10, '10.00', '110.00'], [15, '15.00', '115.00']] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${percent}%` }))
      expect(screen.getByText(`Чаевые: ${tip} BYN`)).toBeInTheDocument()
      expect(screen.getByText(`К оплате: ${total} BYN`)).toBeInTheDocument()
    }
    fireEvent.change(screen.getByLabelText('Своя сумма чаевых'), { target: { value: '7.25' } })
    expect(screen.getByText('Чаевые: 7.25 BYN')).toBeInTheDocument()
    expect(screen.getByText('К оплате: 107.25 BYN')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Оплатить картой' }))
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith('/pay/card') && options?.body === JSON.stringify({ tipsAmountByn: 7.25 }))).toBe(true))
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

  it('shows a safe ERIP error and allows the guest to retry', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    const providerSecret = 'private-provider-secret'
    const consoleLogs = [
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'log').mockImplementation(() => {}),
    ]
    let eripAttempts = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/pay/card/status')) return { ok: true, json: async () => ({ paymentEnabled: false }) } as Response
      if (url.endsWith('/pay/erip/status')) return { ok: true, json: async () => ({ paymentEnabled: true }) } as Response
      if (url.endsWith('/pay/erip')) {
        eripAttempts += 1
        if (eripAttempts === 1) return { ok: false, json: async () => ({ message: 'Не удалось создать запрос', secret: providerSecret }) } as Response
        return { ok: true, json: async () => ({ serviceNo: 12345678, accountNumber: '000000000042' }) } as Response
      }
      return { ok: true, json: async () => ({ id: 'order-1', totalAmountByn: 25 }) } as Response
    })

    render(<PayPage orderId="order-1" />)
    await screen.findByText('К оплате: 25.00 BYN')
    await act(async () => { fireEvent.click(screen.getByRole('tab', { name: 'ЕРИП' })); await Promise.resolve() })

    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось создать запрос ЕРИП. Попробуйте ещё раз.')
    expect(document.body.textContent).not.toContain(providerSecret)
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/pay/erip'))).toHaveLength(1)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Получить код для оплаты' })) })

    expect(await screen.findByText('12345678')).toBeInTheDocument()
    expect(screen.getByText('000000000042')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(providerSecret)
    expect(JSON.stringify(consoleLogs.map((log) => log.mock.calls))).not.toContain(providerSecret)
    expect(eripAttempts).toBe(2)
  })
})
