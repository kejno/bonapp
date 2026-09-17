import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuperAdminPage } from './SuperAdminPage';

const mockMrr = {
  mrr: 3500,
  activeTenants: 7,
  ordersToday: 42,
  mrrHistory: [
    { month: '2026-08', mrr: 3000 },
    { month: '2026-09', mrr: 3500 },
  ],
};

const mockTenants = [
  {
    id: 'tid-1',
    name: 'Ресторан Альфа',
    plan: 'PRO' as const,
    status: 'ACTIVE' as const,
    trialEndsAt: null,
    revenueLastThirtyDays: 450,
    createdAt: '2025-06-01T00:00:00.000Z',
  },
  {
    id: 'tid-2',
    name: 'Кафе Бета',
    plan: 'TRIAL' as const,
    status: 'TRIAL' as const,
    trialEndsAt: '2026-10-01T00:00:00.000Z',
    revenueLastThirtyDays: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'tid-3',
    name: 'Бар Гамма',
    plan: 'STARTER' as const,
    status: 'BLOCKED' as const,
    trialEndsAt: null,
    revenueLastThirtyDays: 100,
    createdAt: '2025-12-01T00:00:00.000Z',
  },
];

const mockMutate = vi.fn();

vi.mock('../../api/superadmin', () => ({
  usePlatformMetrics: () => ({ data: mockMrr, isLoading: false }),
  useTenants: () => ({ data: { data: mockTenants, total: 3 }, isLoading: false }),
  useChangePlan: () => ({ mutate: mockMutate, isPending: false }),
  useBlockTenant: () => ({ mutate: mockMutate, isPending: false }),
  useUnblockTenant: () => ({ mutate: mockMutate, isPending: false }),
  useExtendTrial: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock('recharts', () => ({
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SuperAdminPage', () => {
  it('renders the page heading', () => {
    render(<SuperAdminPage />);
    expect(screen.getByRole('heading', { name: 'Суперадмин консоль' })).toBeInTheDocument();
  });

  it('renders MRR metric card', () => {
    render(<SuperAdminPage />);
    expect(screen.getByText('MRR (BYN)')).toBeInTheDocument();
    expect(screen.getByText('3500.00 BYN')).toBeInTheDocument();
  });

  it('renders active tenants metric card', () => {
    render(<SuperAdminPage />);
    expect(screen.getByText('Активные рестораны')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('renders orders today metric card', () => {
    render(<SuperAdminPage />);
    expect(screen.getByText('QR-заказы сегодня')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders tenant rows in the table', () => {
    render(<SuperAdminPage />);
    expect(screen.getByText('Ресторан Альфа')).toBeInTheDocument();
    expect(screen.getByText('Кафе Бета')).toBeInTheDocument();
    expect(screen.getByText('Бар Гамма')).toBeInTheDocument();
  });

  it('renders plan filter and status filter', () => {
    render(<SuperAdminPage />);
    expect(screen.getByRole('combobox', { name: 'Фильтр по плану' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Фильтр по статусу' })).toBeInTheDocument();
  });

  it('opens change plan modal when action is selected', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('Изменить план'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Изменить тарифный план')).toBeInTheDocument();
  });

  it('opens block confirmation modal for active tenant', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('Заблокировать'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Заблокировать тенанта')).toBeInTheDocument();
  });

  it('shows Продлить триал only for TRIAL status tenants', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });

    // Open dropdown for ACTIVE tenant (index 0) — should NOT have Продлить триал
    fireEvent.click(buttons[0]);
    expect(screen.queryByText('Продлить триал')).not.toBeInTheDocument();
    fireEvent.click(buttons[0]); // close

    // Open dropdown for TRIAL tenant (index 1) — should have Продлить триал
    fireEvent.click(buttons[1]);
    expect(screen.getByText('Продлить триал')).toBeInTheDocument();
  });

  it('shows Разблокировать only for BLOCKED tenant', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[2]);
    expect(screen.getByText('Разблокировать')).toBeInTheDocument();
  });

  it('opens extend trial modal for TRIAL tenant', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[1]);
    fireEvent.click(screen.getByText('Продлить триал'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Продлить триал на 30 дней?')).toBeInTheDocument();
  });

  it('closes modal when Cancel is clicked', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('Заблокировать'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Отмена'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls block mutation on confirm', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[0]);
    fireEvent.click(screen.getByText('Заблокировать'));
    fireEvent.click(screen.getByText('Подтвердить'));
    expect(mockMutate).toHaveBeenCalledWith('tid-1', expect.any(Object));
  });

  it('calls extend trial mutation on confirm', () => {
    render(<SuperAdminPage />);
    const buttons = screen.getAllByRole('button', { name: 'Действия' });
    fireEvent.click(buttons[1]);
    fireEvent.click(screen.getByText('Продлить триал'));
    fireEvent.click(screen.getByText('Подтвердить'));
    expect(mockMutate).toHaveBeenCalledWith('tid-2', expect.any(Object));
  });
});
