import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WelcomePage from './WelcomePage';
import { getReadiness } from '../welcome/welcome.api';

vi.mock('../welcome/welcome.api', () => ({
  getReadiness: vi.fn(),
  openShift: vi.fn(),
  simulateTestOrder: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BNP-450: zero-state и чеклист готовности на /welcome', () => {
  it('показывает пустые состояния и отражает фактическую готовность тенанта', async () => {
    vi.mocked(getReadiness).mockResolvedValue({
      menuReady: true,
      tablesReady: false,
      paymentsReady: true,
      hasOrders: false,
      hasActiveShift: false,
      canSimulateOrder: false,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<MemoryRouter><QueryClientProvider client={client}><WelcomePage /></QueryClientProvider></MemoryRouter>);

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Меню добавлено' })).toBeChecked());
    expect(await screen.findByText('Заказов пока нет')).toBeInTheDocument();
    expect(screen.getByText('Смена не открыта')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Меню добавлено' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Столы созданы' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Платежи настроены' })).toBeChecked();
  });
});
