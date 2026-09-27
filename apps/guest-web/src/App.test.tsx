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
  it('shows the QR scanning prompt when opened without a token', () => {
    render(<App />)

    expect(screen.getByText('Сканируйте QR-код')).toBeInTheDocument()
  })

  it('opens a session from the table token route and applies the restaurant color', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...sessionResponse, tenant: { ...sessionResponse.tenant, brandColor: '#245678' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => configResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    window.history.pushState({}, '', '/t/e2e-token')

    render(<App />)

    expect(await screen.findByText('Стол №5')).toBeInTheDocument()
    expect(document.querySelector('main')).toHaveStyle('--color-primary: #123456')
  })

  it('shows the not-found message when the table token is invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    window.history.pushState({}, '', '/t/unknown-token')

    render(<App />)

    expect(await screen.findByText('Стол не найден')).toBeInTheDocument()
  })

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

  it('does not show waiter calling before that flow is in scope', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => sessionResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => configResponse } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)
    await screen.findByText('Стол №5')
    expect(screen.queryByRole('button', { name: 'Вызвать официанта' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Вызвать официанта' })).not.toBeInTheDocument()
  })
})
