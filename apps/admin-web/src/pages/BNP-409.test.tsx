import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-409 назначение роли', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [{ id: 'staff-1', fullName: 'Анна', email: 'anna@example.com', phone: null, role: 'WAITER', isActive: true, lastLoginAt: null }] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
  });

  it('показывает описание прав для ролей в форме сотрудника', async () => {
    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Редактировать' }));
    const roleSelect = screen.getByRole('combobox');

    expect(roleSelect).toHaveValue('WAITER');
    expect(roleSelect).toHaveTextContent('Официант — Видит KDS и только свои столы');
    expect(roleSelect).toHaveTextContent('Кассир — Работает с кассой и сменами');
    expect(roleSelect).toHaveTextContent('Менеджер — Управляет меню, столами, отчётами, сотрудниками и сменами');
    expect(roleSelect).toHaveTextContent('Администратор — Полный доступ, включая настройки ресторана');
  });
});
