import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import App from '../App';
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
    expect(screen.queryByRole('option', { name: /Администратор/ })).not.toBeInTheDocument();
  });

  it('после входа WAITER получает только KDS и свои столы', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/auth/login')) return Promise.resolve({
        ok: true,
        json: async () => ({
          accessToken: 'waiter-token',
          user: { id: 'staff-1', email: 'anna@example.com', role: 'WAITER', tenantId: 'tenant-1', fullName: 'Анна' },
        }),
      });
      if (url.endsWith('/admin/areas')) return Promise.resolve({ ok: true, json: async () => [{ id: 'area-1', name: 'Основной зал', sortOrder: 1 }] });
      if (url.endsWith('/admin/tables')) return Promise.resolve({ ok: true, json: async () => [
        { id: 'table-4', tableNumber: 4, label: 'Стол Анны', seatsCount: 2, areaId: 'area-1', status: 'AVAILABLE', assignedWaiterId: 'staff-1' },
        { id: 'table-5', tableNumber: 5, label: 'Стол другого официанта', seatsCount: 2, areaId: 'area-1', status: 'AVAILABLE', assignedWaiterId: 'staff-2' },
      ] });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
    useAuthStore.getState().clearAuth();
    window.history.pushState({}, '', '/login');

    render(<App />);
    fireEvent.change(screen.getByLabelText('Email или телефон'), { target: { value: 'anna@example.com' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'waiter-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Добро пожаловать, Анна' })).toBeInTheDocument());
    expect.soft(screen.queryByRole('link', { name: 'Live KDS' })).not.toBeNull();
    expect.soft(screen.queryByRole('link', { name: 'Мои столы' })).not.toBeNull();
    expect.soft(screen.queryByRole('link', { name: 'Каталог меню' })).not.toBeInTheDocument();
    expect.soft(screen.queryByRole('link', { name: 'Настройки заведения' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'Мои столы' }));
    expect(await screen.findByRole('button', { name: 'Стол 4, Свободен' })).toBeInTheDocument();
    expect.soft(screen.queryByRole('button', { name: 'Стол 5, Свободен' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Распечатать QR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Добавить стол' })).not.toBeInTheDocument();
  });

  it('перенаправляет WAITER с административных маршрутов на панель', async () => {
    useAuthStore.getState().setAuth('waiter-token', {
      id: 'staff-1', email: 'anna@example.com', role: 'WAITER', tenantId: 'tenant-1', fullName: 'Анна',
    });
    window.history.pushState({}, '', '/staff');

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Добро пожаловать, Анна' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Сотрудники и смены' })).not.toBeInTheDocument();
  });
});
