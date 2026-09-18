import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('shows the table after initializing a QR session', async () => {
    window.history.replaceState({}, '', '/t/table-token')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tenantId: 'tenant-1',
            tableId: 'table-1',
            tableNumber: '7',
            brandColor: '#123456',
            logoUrl: null,
            tenantName: 'Bonapp Cafe',
          }),
      }),
    )

    render(<App />)

    expect(screen.getByText('Загрузка')).toBeInTheDocument()
    expect(await screen.findByText('Bonapp Cafe')).toBeInTheDocument()
    expect(screen.getByText('Стол №7')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#123456')
    })
  })

  it('asks the guest to scan a QR code outside of a table route', () => {
    render(<App />)

    expect(screen.getByText('Сканируйте QR-код')).toBeInTheDocument()
  })
})
