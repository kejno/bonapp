import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PayPage from './PayPage'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('PayPage', () => {
  it('recalculates total for preset and custom tips', async () => {
    window.sessionStorage.setItem('qrToken', 'table-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'order-1', totalAmountByn: 100 }),
    } as Response)

    render(<PayPage orderId="order-1" />)

    expect(await screen.findByText('Сумма заказа: 100.00 BYN')).toBeInTheDocument()
    for (const [percent, tip, total] of [[0, '0.00', '100.00'], [5, '5.00', '105.00'], [10, '10.00', '110.00'], [15, '15.00', '115.00']] as const) {
      fireEvent.click(screen.getByRole('button', { name: `${percent}%` }))
      expect(screen.getByText(`Чаевые: ${tip} BYN`)).toBeInTheDocument()
      expect(screen.getByText(`Итого: ${total} BYN`)).toBeInTheDocument()
    }
    fireEvent.change(screen.getByLabelText('Своя сумма чаевых'), { target: { value: '7.25' } })
    expect(screen.getByText('Чаевые: 7.25 BYN')).toBeInTheDocument()
    expect(screen.getByText('Итого: 107.25 BYN')).toBeInTheDocument()
  })
})
