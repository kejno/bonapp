import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('StaffPage operation errors', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [{ id: 'staff-1', fullName: 'Кассир', email: 'cashier@example.com', phone: null, role: 'CASHIER', isActive: true, lastLoginAt: null }] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => ({ id: 'shift-1', openedAt: '2026-09-26T10:00:00Z', cashier: { fullName: 'Кассир' }, ordersCount: 2, revenue: '25.00' }) });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }));
  });

  it('shows close and deactivate failures while keeping the close confirmation open', async () => {
    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Закрыть смену' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть смену' }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось закрыть смену');
    expect(screen.getByText('Закрыть смену?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Деактивировать' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Не удалось деактивировать сотрудника'));
  });

  it('shows an error when opening a shift fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }));
    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Открыть смену' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть смену');
  });
});
