import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('renders the guest heading when no table QR token is provided', () => {
    render(<App />)
    const heading = screen.getByText('Bonapp — Guest')

    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('text-primary')
    expect(heading.parentElement?.parentElement).toHaveClass('bg-background')
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
      json: async () => [{ id: 'cat-1', name: 'Кофе', items: [{ id: 'item-1', name: 'Капучино', description: 'На молоке', price: 8.5 }] }],
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол 5 · Main Hall')).toBeInTheDocument()
    expect(screen.getByText('Test Restaurant')).toBeInTheDocument()
    expect(await screen.findByText('Капучино')).toBeInTheDocument()
    expect(screen.getByText('8.5 BYN')).toBeInTheDocument()
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
})
