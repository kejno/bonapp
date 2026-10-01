import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SuperadminPage from './SuperadminPage';
import { changePlan, extendTrial, getOverview, setBlocked, type Overview } from './superadmin.api';

vi.mock('./superadmin.api', () => ({
  getOverview: vi.fn(),
  changePlan: vi.fn(),
  setBlocked: vi.fn(),
  extendTrial: vi.fn(),
}));

describe('BNP-553 фильтрация и управление тенантами', () => {
  let tenants: Overview['tenants'];

  beforeEach(() => {
    tenants = [
      { id: 'active-1', name: 'Кафе', plan: 'PRO', status: 'ACTIVE', trialEndsAt: null, revenue30dByn: 80 },
      { id: 'blocked-1', name: 'Столовая', plan: 'STARTER', status: 'BLOCKED', trialEndsAt: null, revenue30dByn: 15.5 },
      { id: 'trial-1', name: 'Ресторан', plan: 'TRIAL', status: 'TRIAL', trialEndsAt: '2026-12-01T00:00:00.000Z', revenue30dByn: 0 },
    ];
    vi.mocked(getOverview).mockImplementation(async () => ({
      metrics: { subscriptionRevenueByn: 120, activeRestaurants: 1, qrOrdersToday: 9 },
      growth: [],
      tenants: tenants.map((tenant) => ({ ...tenant })),
    }));
    vi.mocked(changePlan).mockImplementation(async (id, plan) => {
      tenants = tenants.map((tenant) => tenant.id === id ? { ...tenant, plan } : tenant);
    });
    vi.mocked(setBlocked).mockImplementation(async (id, blocked) => {
      tenants = tenants.map((tenant) => tenant.id === id ? { ...tenant, status: blocked ? 'BLOCKED' : 'ACTIVE' } : tenant);
    });
    vi.mocked(extendTrial).mockImplementation(async (id) => {
      tenants = tenants.map((tenant) => tenant.id === id
        ? { ...tenant, trialEndsAt: new Date(new Date(tenant.trialEndsAt ?? Date.now()).getTime() + 30 * 86400000).toISOString() }
        : tenant);
    });
  });

  it('показывает поля таблицы, фильтрует статусы и отображает результаты действий', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><SuperadminPage /></MemoryRouter></QueryClientProvider>);

    const cafeRow = await screen.findByRole('row', { name: /Кафе/ });
    const blockedRow = screen.getByRole('row', { name: /Столовая/ });
    const trialRow = screen.getByRole('row', { name: /Ресторан/ });
    for (const column of ['Название', 'План', 'Триал до', 'Выручка за 30 дней', 'Статус']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(within(cafeRow).getByRole('cell', { name: 'Про' })).toBeInTheDocument();
    expect(within(cafeRow).getByText('80,00 BYN')).toBeInTheDocument();
    expect(within(cafeRow).getByText('Активен')).toBeInTheDocument();
    expect(within(blockedRow).getByText('Заблокирован')).toBeInTheDocument();
    expect(within(trialRow).getByText('01.12.2026')).toBeInTheDocument();
    expect(within(trialRow).getByText('На триале')).toBeInTheDocument();

    const statusFilter = screen.getByLabelText('Фильтр по статусу');
    fireEvent.change(statusFilter, { target: { value: 'ACTIVE' } });
    expect(screen.getByRole('row', { name: /Кафе/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Столовая/ })).not.toBeInTheDocument();
    fireEvent.change(statusFilter, { target: { value: 'BLOCKED' } });
    expect(screen.getByRole('row', { name: /Столовая/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Кафе/ })).not.toBeInTheDocument();
    fireEvent.change(statusFilter, { target: { value: 'TRIAL' } });
    expect(screen.getByRole('row', { name: /Ресторан/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Столовая/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Фильтр по плану'), { target: { value: 'PRO' } });
    expect(screen.queryByRole('row', { name: /Ресторан/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Фильтр по плану'), { target: { value: 'ALL' } });
    fireEvent.change(statusFilter, { target: { value: 'ALL' } });
    expect(screen.getByRole('row', { name: /Кафе/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Столовая/ })).toBeInTheDocument();

    const cafeActions = within(screen.getByRole('row', { name: /Кафе/ }));
    fireEvent.change(cafeActions.getByLabelText('План для Кафе'), { target: { value: 'STARTER' } });
    await waitFor(() => expect(within(screen.getByRole('row', { name: /Кафе/ })).getByRole('cell', { name: 'Стартер' })).toBeInTheDocument());
    expect(changePlan).toHaveBeenCalledWith('active-1', 'STARTER');

    fireEvent.click(within(screen.getByRole('row', { name: /Кафе/ })).getByText('Заблокировать'));
    await waitFor(() => expect(within(screen.getByRole('row', { name: /Кафе/ })).getByText('Заблокирован')).toBeInTheDocument());
    expect(setBlocked).toHaveBeenCalledWith('active-1', true);

    fireEvent.click(within(screen.getByRole('row', { name: /Ресторан/ })).getByText('Действия'));
    fireEvent.click(screen.getByText('Продлить триал на 30 дней'));
    fireEvent.click(screen.getByRole('button', { name: 'Продлить' }));
    await waitFor(() => expect(extendTrial).toHaveBeenCalledWith('trial-1'));
    const nextTrialDate = new Date(new Date('2026-12-01T00:00:00.000Z').getTime() + 30 * 86400000)
      .toLocaleDateString('ru-RU');
    await waitFor(() => expect(within(screen.getByRole('row', { name: /Ресторан/ })).getByText(nextTrialDate)).toBeInTheDocument());
    client.clear();
  });
});
