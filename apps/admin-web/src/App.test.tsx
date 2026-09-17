import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./lib/api', () => ({
  fetchIntegrationsStatus: vi.fn().mockResolvedValue({
    iiko: { status: 'NotConfigured', pingMs: null },
    rKeeper: { status: 'NotConfigured', pingMs: null },
    oplaty: { status: 'NotConfigured', merchantId: null },
    erip: { status: 'NotConfigured', serviceId: null },
    bePaid: { status: 'NotConfigured', shopId: null, mode: null },
    skno: { status: 'NotConfigured', serialNumber: null, pingMs: null },
  }),
  updateTenantSettings: vi.fn(),
  syncMenu: vi.fn(),
}))

import App from './App'

describe('App', () => {
  it('renders the integrations page heading', async () => {
    render(<App />)
    expect(await screen.findByText('Интеграции')).toBeInTheDocument()
  })
})
