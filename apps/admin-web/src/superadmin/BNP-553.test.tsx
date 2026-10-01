import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuperadminPage from './SuperadminPage';
import { changePlan, extendTrial, getOverview, setBlocked } from './superadmin.api';

vi.mock('./superadmin.api', () => ({
  getOverview: vi.fn(),
  changePlan: vi.fn(),
  setBlocked: vi.fn(),
  extendTrial: vi.fn(),
}));

describe('BNP-553 фильтрация и управление тенантами', () => {
  beforeEach(() => {
    vi.mocked(getOverview).mockResolvedValue({
      metrics: { subscriptionRevenueByn: 120, activeRestaurants: 2, qrOrdersToday: 9 },
      growth: [],
      tenants: [
        { id: 'active-1', name: 'Кафе', plan: 'PRO', status: 'ACTIVE', trialEndsAt: null, revenue30dByn: 80 },
        { id: 'trial-1', name: 'Ресторан', plan: 'TRIAL', status: 'TRIAL', trialEndsAt: '2026-12-01T00:00:00.000Z', revenue30dByn: 0 },
      ],
    });
    vi.mocked(changePlan).mockResolvedValue(undefined);
    vi.mocked(setBlocked).mockResolvedValue(undefined);
    vi.mocked(extendTrial).mockResolvedValue(undefined);
  });

  it('фильтрует таблицу по плану и статусу и выполняет действия над тенантом', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SuperadminPage /></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText('Кафе')).toBeInTheDocument();
    expect(screen.getByText('Ресторан')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Фильтр по плану'), { target: { value: 'TRIAL' } });
    expect(screen.queryByText('Кафе')).not.toBeInTheDocument();
    expect(screen.getByText('Ресторан')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Фильтр по статусу'), { target: { value: 'TRIAL' } });
    fireEvent.click(screen.getAllByText('Действия')[1]);
    fireEvent.change(screen.getByLabelText('План для Ресторан'), { target: { value: 'PRO' } });
    await waitFor(() => expect(changePlan).toHaveBeenCalledWith('trial-1', 'PRO'));
    fireEvent.click(screen.getByText('Заблокировать'));
    await waitFor(() => expect(setBlocked).toHaveBeenCalledWith('trial-1', true));
    fireEvent.click(screen.getByText('Продлить триал на 30 дней'));
    fireEvent.click(screen.getByRole('button', { name: 'Продлить' }));
    await waitFor(() => expect(extendTrial).toHaveBeenCalledWith('trial-1'));
    client.clear();
  });
});
