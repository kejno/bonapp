import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage';
import { useAuthStore } from '../auth/auth.store';
import { getDailySummary } from '../analytics/analytics.api';

vi.mock('../analytics/analytics.api', () => ({ getDailySummary: vi.fn() }));

describe('DashboardPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useAuthStore.setState({ user: null, accessToken: null });
  });

  it('keeps the waiter dashboard available without requesting admin analytics', async () => {
    vi.mocked(getDailySummary).mockReset().mockResolvedValue({
      revenueByn: 0,
      averageCheckByn: 0,
      ordersCount: 0,
      tablesOccupancyPercent: 0,
      pos: { configured: false, pingMs: null },
      topDishes: [],
    });
    useAuthStore.setState({ user: { id: 'waiter-1', fullName: 'Иван', role: 'WAITER' } as never });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText('Мои столы')).toBeInTheDocument();
    await waitFor(() => expect(getDailySummary).not.toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    queryClient.clear();
  });
});
