import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { useCartStore } from './cart.store'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCartStore.setState({ quantities: {}, itemCount: 0 })
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('renders the guest heading when no table QR token is provided', () => {
    render(<App />)
    const heading = screen.getByText('Bonapp')

    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('text-primary')
    expect(heading.closest('main')).toHaveClass('bg-background')
  })

  it('resolves the QR token from the URL through the guest session API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
      tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN', logoUrl: null },
        table: { tableNumber: 5, areaName: 'Main Hall' },
        activeOrder: null,
      }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: 'На молоке', priceByn: 8.5, imageUrl: null, isHit: true, isInStopList: false, modifierGroups: [] }] }],
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол №5')).toBeInTheDocument()
    expect(screen.getByText('Test Restaurant')).toBeInTheDocument()
    expect(await screen.findByText('Капучино')).toBeInTheDocument()
    expect(screen.getByText('8.50 BYN')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Кофе' })).toBeInTheDocument()
    expect(screen.getByLabelText('Хит')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Добавить' }))
    expect(screen.getByLabelText('1 позиция')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/stable-qr-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/menu$/),
      expect.objectContaining({ signal: expect.any(AbortSignal), headers: { 'X-QR-Token': 'stable-qr-token' } }),
    )
  })

  it('filters menu items by their name and description without another request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tenant: { id: 'tenant-1', name: 'Cafe', currency: 'BYN' }, table: { tableNumber: 2, areaName: 'Hall' } }),
    } as Response).mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'coffee', name: 'Кофе', items: [
        { id: 'latte', name: 'Латте', description: 'На овсяном молоке', priceByn: 7, imageUrl: null, isHit: false, isInStopList: false, modifierGroups: [] },
        { id: 'tea', name: 'Чай', description: 'Чёрный чай', priceByn: 4, imageUrl: null, isHit: false, isInStopList: false, modifierGroups: [] },
      ] }],
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=session-token')
    render(<App />)

    expect(await screen.findByText('Латте')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по меню' }), { target: { value: 'овсяном' } })
    expect(screen.getByText('Латте')).toBeInTheDocument()
    expect(screen.queryByText('Чай')).not.toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('shows an error when the QR token cannot be resolved', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false } as Response)
    window.history.pushState({}, '', '/menu?qr_token=unknown-token')

    render(<App />)

    expect(await screen.findByText('Не удалось открыть стол по QR-коду. Отсканируйте актуальный код.')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/unknown-token$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
