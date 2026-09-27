import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useCartStore } from './cart'

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCartStore.setState({ items: [] })
  window.history.pushState({}, '', '/')
})

const sessionResponse = {
  tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN', logoUrl: null },
  table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' },
  activeOrder: null,
}
const configResponse = { logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }

describe('App', () => {
  it('renders the menu and adds a dish to the cart', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => sessionResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => configResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'coffee', name: 'Кофе', items: [{ id: 'latte', name: 'Латте', description: 'На молоке', priceByn: 7, imageUrl: null, isHit: true, isInStopList: false, modifierGroups: [] }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол №5')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Кофе' })).toBeInTheDocument()
    expect(screen.getByLabelText('Хит')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Латте/ }))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(screen.getByLabelText('Количество товаров в корзине')).toHaveTextContent('1')
  })

  it('sends a waiter call with the QR session and shows a success state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => sessionResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => configResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)
    await screen.findByText('Стол №5')
    fireEvent.click(screen.getByRole('button', { name: 'Вызвать официанта' }))
    fireEvent.click(screen.getByRole('button', { name: 'Попросить счёт' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Запрос на счёт отправлен')
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringMatching(/\/guest\/call-waiter$/), expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-QR-Token': 'stable-qr-token' },
      body: JSON.stringify({ reason: 'NEED_BILL' }),
    }))
  })

  it('shows an error when the waiter call fails', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => sessionResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => configResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: false } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)
    await screen.findByText('Стол №5')
    fireEvent.click(screen.getByRole('button', { name: 'Вызвать официанта' }))
    fireEvent.click(screen.getByRole('button', { name: 'Позвать официанта' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось отправить вызов')
    expect(screen.getByRole('dialog', { name: 'Вызвать официанта' })).toBeInTheDocument()
  })
})
