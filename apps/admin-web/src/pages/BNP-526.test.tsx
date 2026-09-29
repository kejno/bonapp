import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import IntegrationsPage from './IntegrationsPage';

vi.mock('../auth/auth.store', () => ({ useAuthStore: (selector: (state: { accessToken: string }) => unknown) => selector({ accessToken: 'test-token' }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('BNP-526: payment gateway cards', () => {
  it('shows configured gateway identifiers and mode without revealing secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ integrations: {
      iiko: { status: 'Online', pingMs: 12, settings: { apiUrl: 'https://iiko.test', apiKey: '', appId: 'app-1', clientSecret: '', organizationId: 'org-1', terminalGroupId: 'terminal-1' } },
      r_keeper: { status: 'NotConfigured', pingMs: null, settings: {} },
      oplati: { status: 'Active', pingMs: null, settings: { merchantId: 'merchant-1', apiKey: '' } },
      erip: { status: 'Active', pingMs: null, settings: { serviceId: 'service-1' } },
      bePaid: { status: 'Active', pingMs: null, settings: { shopId: 'shop-1', mode: 'Test', secretKey: '' } },
      skno: { status: 'NotConfigured', pingMs: null, settings: { serialNumber: 'serial-1' } },
    } }) }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><IntegrationsPage /></QueryClientProvider>);

    expect(await screen.findByText('merchant-1')).toBeInTheDocument();
    expect(screen.getByText('service-1')).toBeInTheDocument();
    expect(screen.getByText('shop-1')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('В сети')).toBeInTheDocument();
    expect(screen.queryByText(/secret|api-key/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('private-secret');
  });
});
