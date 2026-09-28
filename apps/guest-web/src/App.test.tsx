import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { activateCartForQrToken, useCartStore } from './orders/cart.store'

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCartStore.setState({ items: [], comment: '', qrToken: null })
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('asks the guest to scan a QR code without requesting a session when no token is provided', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    render(<App />)

    expect(screen.getByText('Bonapp')).toHaveClass('text-primary')
    expect(screen.getByLabelText('Количество товаров в корзине')).toHaveTextContent('0')
    expect(screen.getByRole('main')).toHaveClass('bg-background')
    expect(screen.getByText('Сканируйте QR-код')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('resolves the QR token from the URL through the guest session API', async () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('3f3b8e2c-4d63-4ba7-a52b-91ec5991c1a3')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
        table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' },
        activeOrder: null,
      }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: 'На молоке', priceByn: 8.5 }] }],
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол 5 · Main Hall')).toBeInTheDocument()
    expect(screen.getByText('Test Restaurant')).toBeInTheDocument()
    expect(await screen.findByText('Капучино')).toBeInTheDocument()
    expect(localStorage.getItem('guest_session_id')).toBe('3f3b8e2c-4d63-4ba7-a52b-91ec5991c1a3')
    expect(screen.getByText('8.50 BYN')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/stable-qr-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/tenant\/config\?tenantId=tenant-1$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/menu\?tenantId=tenant-1$/),
      expect.objectContaining({
        headers: { 'X-QR-Token': 'stable-qr-token' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('renders and enforces required modifier groups in the API response shape', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: null, priceByn: 8.5, modifierGroups: [{ sortOrder: 0, modifierGroup: { id: 'milk', name: 'Молоко', isRequired: true, minSelection: 1, maxSelection: 1, modifiers: [{ id: 'oat', name: 'Овсяное', price: 1.5 }] } }] }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать · Капучино' }))
    expect(screen.getByText('Молоко')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите обязательные модификаторы')
    fireEvent.click(screen.getByLabelText(/Овсяное/))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(screen.getByRole('link', { name: 'Оформить заказ (1)' })).toBeInTheDocument()
  })

  it('clears the previous table cart when checkout opens with another QR token', () => {
    activateCartForQrToken('qr-table-a')
    useCartStore.getState().addItem({ id: 'dish-1', name: 'Борщ', priceByn: 8.5, quantity: 1, selectedModifiers: [] })
    window.sessionStorage.setItem('qrToken', 'qr-table-a')
    window.history.pushState({}, '', '/order/checkout?qr_token=qr-table-b')

    render(<App />)

    expect(screen.getByText('Корзина пуста')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Вернуться в меню' })).toHaveAttribute('href', '/?qr_token=qr-table-b')
  })

  it('adds a menu item to the order id carried back from the status screen', async () => {
    window.sessionStorage.setItem('qrToken', 'stable-qr-token')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: { id: 'order-1', status: 'COOKING' } }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: null, priceByn: 8.5 }] }] } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'order-1' }) } as Response)
    window.history.pushState({}, '', '/?qr_token=stable-qr-token&orderId=order-1')

    render(<App />)

    expect(await screen.findByRole('link', { name: 'Статус заказа' })).toHaveAttribute(
      'href',
      '/order/order-1/status?qr_token=stable-qr-token',
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить Капучино' }))

    expect(await screen.findByText('Позиция добавлена в заказ')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringMatching(/\/guest\/orders\/order-1\/items$/), expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-QR-Token': 'stable-qr-token' }), body: JSON.stringify({ itemId: 'item-1', quantity: 1 }),
    }))
  })

  it('shows an error when the QR token cannot be resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    window.history.pushState({}, '', '/menu?qr_token=unknown-token')

    render(<App />)

    expect(await screen.findByText('Стол не найден')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/unknown-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('filters the loaded menu by item name and description without another API request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat-1', name: 'Основное', items: [
        { id: 'borscht', name: 'Борщ', description: 'Свёкла и говядина', priceByn: 12 },
        { id: 'draniki', name: 'Драники', description: 'Картофель и сметана', priceByn: 10 },
      ] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    const search = await screen.findByRole('searchbox', { name: 'Поиск блюд' })
    expect(screen.getByText('Драники')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'борщ' } })
    expect(screen.getByText('Борщ')).toBeInTheDocument()
    expect(screen.queryByText('Драники')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'говядина' } })
    expect(screen.getByText('Борщ')).toBeInTheDocument()
    expect(screen.queryByText('Драники')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByText('Борщ')).toBeInTheDocument()
    expect(screen.getByText('Драники')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('shows a not found error when an unknown table token is opened from its route', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    window.history.pushState({}, '', '/t/unknown-token')

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Стол не найден')
    expect(screen.queryByText('Открываем стол…')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/unknown-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('shows a not found error when a table route contains malformed percent encoding', () => {
    window.history.pushState({}, '', '/t/%')

    expect(() => render(<App />)).not.toThrow()
    expect(screen.getByRole('alert')).toHaveTextContent('Стол не найден')
    expect(screen.queryByText('Открываем стол…')).not.toBeInTheDocument()
  })

  it('sends a waiter call using the QR session and selected reason', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
        table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null,
      }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')
    render(<App />)
    await screen.findByText('Стол 5 · Main Hall')
    fireEvent.click(screen.getByRole('button', { name: 'Вызвать официанта' }))
    fireEvent.click(screen.getByRole('button', { name: 'Попросить счёт' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Официант уже идёт')
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringMatching(/\/guest\/call-waiter$/), expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-QR-Token': 'stable-qr-token' }),
      body: JSON.stringify({ tableId: 'table-1', reason: 'NEED_BILL' }),
    }))
  })

  it('shows an error when sending a waiter call fails because of a network error', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
        table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null,
      }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')
    render(<App />)
    await screen.findByText('Стол 5 · Main Hall')
    fireEvent.click(screen.getByRole('button', { name: 'Вызвать официанта' }))
    fireEvent.click(screen.getByRole('button', { name: 'Попросить счёт' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Не удалось отправить вызов')
    expect(screen.getByRole('dialog', { name: 'Вызвать официанта' })).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringMatching(/\/guest\/call-waiter$/), expect.objectContaining({
      method: 'POST', body: JSON.stringify({ tableId: 'table-1', reason: 'NEED_BILL' }),
    }))
  })

  it('validates required modifiers and adds the selected dish to the cart', async () => {
    useCartStore.setState({ items: [] })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat', name: 'Пицца', items: [{ id: 'pizza', name: 'Маргарита', description: null, priceByn: 20, modifierGroups: [{ modifierGroup: { id: 'size', name: 'Размер', isRequired: true, minSelection: 1, maxSelection: 1, modifiers: [{ id: 'large', name: 'Большая', price: '2.50' }] } }] }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=test-token')
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать · Маргарита' }))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите обязательные модификаторы')
    fireEvent.click(screen.getByLabelText(/Большая/))
    expect(screen.getByRole('button', { name: 'Добавить в заказ · 22.50 BYN' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(screen.getByLabelText('Количество товаров в корзине')).toHaveTextContent('Корзина · 1')
  })

  it('requires minSelection even when a modifier group is not marked required', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat', name: 'Кофе', items: [{ id: 'coffee', name: 'Кофе', description: null, priceByn: 5, modifierGroups: [{ modifierGroup: { id: 'milk', name: 'Молоко', isRequired: false, minSelection: 1, maxSelection: 2, modifiers: [{ id: 'oat', name: 'Овсяное', price: 1 }, { id: 'soy', name: 'Соевое', price: 2 }] } }] }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=test-token')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать · Кофе' }))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Выберите обязательные модификаторы')
    fireEvent.click(screen.getByLabelText(/Овсяное/))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Оформить заказ (1)' })).toBeInTheDocument()
  })

  it('allows multiple selections in a required group when maxSelection allows them', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: true, json: async () => ({ tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' }, table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' }, activeOrder: null }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'cat', name: 'Пицца', items: [{ id: 'pizza', name: 'Пицца', description: null, priceByn: 10, modifierGroups: [{ modifierGroup: { id: 'toppings', name: 'Добавки', isRequired: true, minSelection: 1, maxSelection: 2, modifiers: [{ id: 'olive', name: 'Оливки', price: 1 }, { id: 'pepper', name: 'Перец', price: 2 }] } }] }] }] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=test-token')
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Выбрать · Пицца' }))
    fireEvent.click(screen.getByLabelText(/Оливки/))
    fireEvent.click(screen.getByLabelText(/Перец/))
    fireEvent.click(screen.getByRole('button', { name: /Добавить в заказ/ }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Оформить заказ (1)' })).toBeInTheDocument()
    cleanup()
    window.history.pushState({}, '', '/order/checkout?qr_token=test-token')
    render(<App />)

    expect(screen.getByText('Пицца · 13.00 BYN')).toBeInTheDocument()
    expect(screen.getByText('Итого: 13.00 BYN')).toBeInTheDocument()
  })

})
