import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-408 деактивация сотрудника', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    let active = true;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/staff/staff-1') && init?.method === 'DELETE') { active = false; return Promise.resolve({ ok: true, json: async () => ({}) }); }
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [{ id: 'staff-1', fullName: 'Ольга Смирнова', email: 'olga@example.com', phone: null, role: 'WAITER', isActive: active, lastLoginAt: null }] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
  });

  it('отправляет запрос деактивации и показывает статус «Неактивен»', async () => {
    render(<StaffPage />);
    expect(await screen.findByText('Ольга Смирнова')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Деактивировать' }));

    await waitFor(() => expect(screen.getByText('Неактивен')).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/staff/staff-1'), expect.objectContaining({ method: 'DELETE' }));
    expect(screen.queryByRole('button', { name: 'Деактивировать' })).not.toBeInTheDocument();
  });
});
