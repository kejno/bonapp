import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SuperadminPage from './SuperadminPage';
import { getOverview } from './superadmin.api';

vi.mock('./superadmin.api', () => ({ getOverview: vi.fn(), changePlan: vi.fn(), setBlocked: vi.fn(), extendTrial: vi.fn() }));

describe('SuperadminPage', () => {
  beforeEach(() => vi.mocked(getOverview).mockResolvedValue({
    metrics: { subscriptionRevenueByn: 120, activeRestaurants: 2, qrOrdersToday: 9 },
    growth: [{ month: 'окт. 26', subscriptionRevenueByn: 120 }],
    tenants: [
      { id: 't1', name: 'Кафе', plan: 'PRO', status: 'ACTIVE', trialEndsAt: null, revenue30dByn: 80 },
      { id: 't2', name: 'Ресторан', plan: 'TRIAL', status: 'TRIAL', trialEndsAt: '2026-08-01T12:00:00.000Z', revenue30dByn: 0 },
    ],
  }));
  afterEach(() => vi.useRealTimers());

  it('shows platform metrics and filters tenant rows by status', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SuperadminPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('120,00 BYN')).toBeInTheDocument();
    expect(screen.getByText('Подписочная выручка за месяц')).toBeInTheDocument();
    expect(screen.getByText('Кафе')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Фильтр по статусу'), { target: { value: 'TRIAL' } });
    expect(screen.queryByText('Кафе')).not.toBeInTheDocument();
    expect(screen.getByText('Ресторан')).toBeInTheDocument();
    client.clear();
  });

  it('shows the extension date based on today when the trial already expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SuperadminPage /></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Продлить триал на 30 дней').catch(() => undefined);
    fireEvent.click(screen.getAllByText('Действия')[1]);
    fireEvent.click(screen.getByText('Продлить триал на 30 дней'));
    expect(screen.getByText('Новая дата окончания: 31.10.2026')).toBeInTheDocument();
    client.clear();
  });
});
