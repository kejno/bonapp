import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useCartStore } from './cart'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('renders the guest header and an empty cart when no table QR token is provided', () => {
    render(<App />)
    const heading = screen.getByText('Bonapp')

    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('text-primary')
    expect(screen.getByLabelText('Количество товаров в корзине')).toHaveTextContent('0')
  })

  it('resolves the QR token from the URL through the guest session API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
        table: { tableNumber: 5, areaName: 'Main Hall' },
        activeOrder: null,
      }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: 'На молоке', priceByn: 8.5 }] }],
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол 5 · Main Hall')).toBeInTheDocument()
    expect(screen.getByText('Test Restaurant')).toBeInTheDocument()
    expect(await screen.findByText('Капучино')).toBeInTheDocument()
    expect(screen.getByText('8.50 BYN')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/stable-qr-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/menu\?tenantId=tenant-1$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('shows an error when the QR token cannot be resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    window.history.pushState({}, '', '/menu?qr_token=unknown-token')

    render(<App />)

    expect(await screen.findByText('Не удалось открыть стол по QR-коду')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/unknown-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('validates required modifiers and adds the selected dish to the cart', async () => {
    useCartStore.setState({ items: [] })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({
      tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
      table: { tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null,
    }) } as Response).mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat', name: 'Пицца', items: [{
      id: 'pizza', name: 'Маргарита', priceByn: 20, modifierGroups: [{ modifierGroup: {
        id: 'size', name: 'Размер', isRequired: true, minSelection: 1, maxSelection: 1,
        modifiers: [{ id: 'large', name: 'Большая', price: '2.50' }],
      } }],
    }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=test-token')
    render(<App />)
    fireEvent.click(await screen.findByText('Маргарита'))
    fireEvent.click(screen.getByText(/Добавить в заказ/))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите обязательные модификаторы')
    fireEvent.click(screen.getByLabelText(/Большая/))
    fireEvent.click(screen.getByText(/Добавить в заказ/))
    await waitFor(() => expect(useCartStore.getState().items).toEqual([{
      itemId: 'pizza', quantity: 1, selectedModifiers: [{ id: 'large', name: 'Большая', price: 2.5 }], unitPrice: 22.5,
    }]))
    expect(screen.getByLabelText('Количество товаров в корзине')).toHaveTextContent('1')
  })
})
