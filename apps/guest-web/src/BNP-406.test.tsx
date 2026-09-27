import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import SettingsPage from '../../admin-web/src/settings/SettingsPage'

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('BNP-406: применение сохранённого брендинга в гостевом PWA', () => {
  it('применяет в меню цвет, сохранённый через настройки заведения', async () => {
    let persistedSettings = {
      name: 'Test Restaurant', slug: 'test-restaurant', address: null, unp: null,
      legalName: null, logoUrl: null, brandColor: '#e0533c', serviceMode: 'ORDER_AND_PAY',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/v1/admin/tenant/settings' && init?.method === 'PUT') {
        persistedSettings = { ...persistedSettings, ...JSON.parse(String(init.body)) }
        return { ok: true, json: async () => persistedSettings } as Response
      }
      if (url === '/api/v1/admin/tenant/settings') {
        return { ok: true, json: async () => persistedSettings } as Response
      }
      if (url.includes('/guest/session/')) {
        return { ok: true, json: async () => ({
          tenant: { id: 'tenant-1', name: persistedSettings.name, currency: 'BYN' },
          table: { id: 'table-1', tableNumber: 5, areaName: 'Main Hall' },
          activeOrder: null,
        }) } as Response
      }
      if (url.includes('/guest/tenant/config')) {
        return { ok: true, json: async () => ({
          logoUrl: persistedSettings.logoUrl,
          brandColor: persistedSettings.brandColor,
          serviceMode: persistedSettings.serviceMode,
        }) } as Response
      }
      if (url.includes('/guest/menu')) return { ok: true, json: async () => [] } as Response
      throw new Error(`Unexpected request: ${url}`)
    })

    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('Цвет бренда'), { target: { value: '#123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Настройки сохранены')
    expect(persistedSettings.brandColor).toBe('#123456')

    cleanup()
    window.history.pushState({}, '', '/menu?qr_token=stable-qr-token')
    render(<App />)

    await waitFor(() => expect(screen.getByRole('main')).toHaveStyle({ '--color-primary': '#123456' }))
    expect(await screen.findByText('Test Restaurant')).toBeInTheDocument()
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/\/guest\/tenant\/config\?tenantId=tenant-1$/), expect.any(Object))
  })
})
