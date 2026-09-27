import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-470 изменение и деактивация сотрудника', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
  });

  it('сохраняет изменения и отображает деактивированный статус', async () => {
    let employee = { id: 'employee-1', fullName: 'Ольга Смирнова', email: 'olga@example.com', phone: '+375291111111', role: 'WAITER', isActive: true, lastLoginAt: null };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/staff/employee-1') && init?.method === 'PUT') { const body = JSON.parse(String(init.body)); employee = { ...employee, fullName: body.full_name, ...body }; return Promise.resolve({ ok: true, json: async () => employee }); }
      if (url.endsWith('/admin/staff/employee-1') && init?.method === 'DELETE') { employee = { ...employee, isActive: false }; return Promise.resolve({ ok: true, json: async () => ({}) }); }
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [employee] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: 'Ольга Иванова' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Ольга Иванова')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/staff/employee-1'), expect.objectContaining({ method: 'PUT', body: expect.stringContaining('full_name') })));

    fireEvent.click(screen.getByRole('button', { name: 'Деактивировать' }));
    expect(await screen.findByText('Неактивен')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/staff/employee-1'), expect.objectContaining({ method: 'DELETE' }));
  });
});
