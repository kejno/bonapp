import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntegrationStatus } from '@bonapp/shared-types';
import { IntegrationsPage } from './IntegrationsPage';

vi.mock('../../lib/api', () => ({
  fetchIntegrationsStatus: vi.fn(),
  updateTenantSettings: vi.fn(),
  syncMenu: vi.fn(),
}));

const allNotConfigured = {
  iiko: { status: IntegrationStatus.NotConfigured, pingMs: null },
  rKeeper: { status: IntegrationStatus.NotConfigured, pingMs: null },
  oplaty: { status: IntegrationStatus.NotConfigured, merchantId: null },
  erip: { status: IntegrationStatus.NotConfigured, serviceId: null },
  bePaid: { status: IntegrationStatus.NotConfigured, shopId: null, mode: null },
  skno: { status: IntegrationStatus.NotConfigured, serialNumber: null, pingMs: null },
};

const allActive = {
  iiko: { status: IntegrationStatus.Online, pingMs: 42 },
  rKeeper: { status: IntegrationStatus.Online, pingMs: 15 },
  oplaty: { status: IntegrationStatus.Active, merchantId: 'M-1' },
  erip: { status: IntegrationStatus.Active, serviceId: 'SVC-1' },
  bePaid: { status: IntegrationStatus.Active, shopId: 'S-1', mode: 'test' as const },
  skno: { status: IntegrationStatus.Online, serialNumber: 'SN-001', pingMs: 8 },
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('IntegrationsPage', () => {
  it('renders page heading', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue(allNotConfigured);

    wrap(<IntegrationsPage tenantId="t1" />);

    expect(await screen.findByText('Интеграции')).toBeInTheDocument();
  });

  it('renders 6 integration cards after loading', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue(allNotConfigured);

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      expect(screen.getByTestId('integration-card-iiko')).toBeInTheDocument();
      expect(screen.getByTestId('integration-card-r_keeper')).toBeInTheDocument();
      expect(screen.getByTestId('integration-card-oplaty')).toBeInTheDocument();
      expect(screen.getByTestId('integration-card-erip')).toBeInTheDocument();
      expect(screen.getByTestId('integration-card-bepaid')).toBeInTheDocument();
      expect(screen.getByTestId('integration-card-skno')).toBeInTheDocument();
    });
  });

  it('shows Online status for iiko when configured and reachable', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue(allActive);

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      const card = screen.getByTestId('integration-card-iiko');
      expect(card).toHaveTextContent('Online');
      expect(card).toHaveTextContent('42 ms');
    });
  });

  it('shows Connection failed for iiko when ping fails', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...allNotConfigured,
      iiko: { status: IntegrationStatus.ConnectionFailed, pingMs: null },
    });

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      expect(screen.getByTestId('integration-card-iiko')).toHaveTextContent('Connection failed');
    });
  });

  it('shows merchant ID on oplaty card', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue(allActive);

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      expect(screen.getByTestId('integration-card-oplaty')).toHaveTextContent('M-1');
    });
  });

  it('shows shop ID and mode on bePaid card', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockResolvedValue(allActive);

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      const card = screen.getByTestId('integration-card-bepaid');
      expect(card).toHaveTextContent('S-1');
      expect(card).toHaveTextContent('test');
    });
  });

  it('shows error state when fetch fails', async () => {
    const { fetchIntegrationsStatus } = await import('../../lib/api');
    (fetchIntegrationsStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    wrap(<IntegrationsPage tenantId="t1" />);

    await waitFor(() => {
      expect(screen.getByText(/ошибка/i)).toBeInTheDocument();
    });
  });
});
