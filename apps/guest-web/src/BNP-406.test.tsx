import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('BNP-406: применение сохранённого брендинга в гостевом PWA', () => {
  it('повторно загружает конфигурацию при открытии меню и применяет цвет бренда', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tenant: { id: 'tenant-1', name: 'Test Restaurant', currency: 'BYN' },
          table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' },
          activeOrder: null,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ logoUrl: null, brandColor: '#123456', serviceMode: 'ORDER_AND_PAY' }),
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => [] } as Response)
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')

    render(<App />)

    await waitFor(() => expect(screen.getByRole('main')).toHaveStyle({ '--color-primary': '#123456' }))
    expect(await screen.findByText('Test Restaurant')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/guest\/tenant\/config\?tenantId=tenant-1$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })
})
