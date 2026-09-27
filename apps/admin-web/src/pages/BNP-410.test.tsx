import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-410 открытие и закрытие смены', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
  });

  it('отображает итоги смены и после закрытия обновляет состояние', async () => {
    let shiftOpen = true;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => shiftOpen ? { id: 'shift-1', openedAt: '2026-09-26T10:00:00Z', cashier: { fullName: 'Иван Петров' }, ordersCount: 3, revenue: '125.50' } : null });
      if (url.endsWith('/admin/shifts/close') && init?.method === 'POST') { shiftOpen = false; return Promise.resolve({ ok: true, json: async () => ({}) }); }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StaffPage />);
    expect(await screen.findByText('Кассир: Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Заказов: 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть смену' }));
    expect(screen.getByText('Выручка: 125.50 BYN')).toBeInTheDocument();
    expect(screen.getByText('Количество чеков: 3')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть смену' }).at(-1)!);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Открыть смену' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/shifts/close'), expect.objectContaining({ method: 'POST' }));
  });
});
