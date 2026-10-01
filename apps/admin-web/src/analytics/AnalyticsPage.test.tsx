import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage, { rangeFor } from './AnalyticsPage';
import { getPaymentsSplit, getRevenue, getShiftReport, getTenantDate, getTips } from './analytics.api';

vi.mock('./analytics.api', () => ({
  exportTransactions: vi.fn(), getPaymentsSplit: vi.fn(), getRevenue: vi.fn(), getShiftReport: vi.fn(), getTenantDate: vi.fn(), getTips: vi.fn(),
}));


function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(getRevenue).mockRejectedValue(new Error('revenue error'));
    vi.mocked(getPaymentsSplit).mockRejectedValue(new Error('payments error'));
    vi.mocked(getTips).mockRejectedValue(new Error('tips error'));
    vi.mocked(getShiftReport).mockResolvedValue(null);
    vi.mocked(getTenantDate).mockResolvedValue('2026-03-08');
  });

  it('reports payment and tips request failures separately from empty results', async () => {
    renderPage();
    expect(await screen.findByText('Не удалось загрузить оплаты')).toBeInTheDocument();
    expect(await screen.findByText('Не удалось загрузить чаевые')).toBeInTheDocument();
    expect(screen.queryByText('Нет данных по оплатам')).not.toBeInTheDocument();
    expect(screen.queryByText('Чаевых за период нет')).not.toBeInTheDocument();
  });

  it('builds calendar date ranges without converting them to browser-timezone instants', () => {
    expect(rangeFor('custom', '2026-03-08', '2026-03-09', '2026-03-09')).toEqual({ from: '2026-03-08', to: '2026-03-09', days: 2 });
    expect(rangeFor('week', '', '', '2026-03-09')).toEqual({ from: '2026-03-03', to: '2026-03-09', days: 7 });
  });

  it('uses the restaurant date rather than the browser date for presets', () => {
    expect(rangeFor('today', '', '', '2026-03-08')).toEqual({ from: '2026-03-08', to: '2026-03-08', days: 1 });
    expect(rangeFor('week', '', '', '2026-03-08')).toEqual({ from: '2026-03-02', to: '2026-03-08', days: 7 });
  });
});
