import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useCartStore } from './cart-store'

describe('checkout', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/order/checkout?qrToken=table-token')
    useCartStore.getState().clear()
    useCartStore.getState().add({ menuItemId: 'coffee', name: 'Coffee', unitPriceByn: 5, selectedModifiers: ['oat'] })
  })

  it('submits the cart, then clears it and opens the order status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ orderId: 'order-1' }) }))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Комментарий повару'), { target: { value: 'Less sugar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Оформить заказ' }))

    expect(await screen.findByText('Заказ № order-1 принят')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/v1/guest/orders', expect.objectContaining({ method: 'POST' }))
    expect(useCartStore.getState().items).toEqual([])
  })
})
