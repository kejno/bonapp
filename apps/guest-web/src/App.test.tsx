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
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        tenant: { name: 'Test Restaurant' },
        table: { tableNumber: 5, areaName: 'Main Hall' },
        activeOrder: null,
      }),
    } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    expect(await screen.findByText('Стол 5 · Main Hall')).toBeInTheDocument()
    expect(screen.getByText('Test Restaurant')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/session\/stable-qr-token$/),
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
