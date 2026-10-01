import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from './AnalyticsPage';
import { getPaymentsSplit, getRevenue, getShiftReport, getTenantDate, getTips } from './analytics.api';

vi.mock('./analytics.api', () => ({
  exportTransactions: vi.fn(),
  getPaymentsSplit: vi.fn(),
  getRevenue: vi.fn(),
  getShiftReport: vi.fn(),
  getTenantDate: vi.fn(),
  getTips: vi.fn(),
}));

describe('BNP-546 analytics date range', () => {
  beforeEach(() => {
    vi.mocked(getTenantDate).mockResolvedValue('2026-03-09');
    vi.mocked(getRevenue).mockResolvedValue([]);
    vi.mocked(getPaymentsSplit).mockResolvedValue([]);
    vi.mocked(getTips).mockResolvedValue([]);
    vi.mocked(getShiftReport).mockResolvedValue(null);
  });

  it('reloads chart data using the selected period and matching granularity', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);

    await waitFor(() => expect(getRevenue).toHaveBeenCalledWith('2026-03-09', '2026-03-09', 'hour'));
    fireEvent.click(screen.getByRole('button', { name: 'Неделя' }));

    await waitFor(() => expect(getRevenue).toHaveBeenCalledWith('2026-03-03', '2026-03-09', 'day'));
    expect(getPaymentsSplit).toHaveBeenCalledWith('2026-03-03', '2026-03-09');
    expect(getTips).toHaveBeenCalledWith('2026-03-03', '2026-03-09');
  });
});
