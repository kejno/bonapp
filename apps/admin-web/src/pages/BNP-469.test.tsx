import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-469 добавление сотрудника', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
  });

  it('создаёт сотрудника с заданными ролью и контактами', async () => {
    const employee = { id: 'employee-1', fullName: 'Иван Петров', email: 'ivan@example.com', phone: '+375291234567', role: 'CASHIER', isActive: true, lastLoginAt: null };
    vi.stubGlobal('fetch', vi.fn().mockImplementation((input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/admin/staff') && init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => employee });
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [employee] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить сотрудника' }));
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: employee.fullName } });
    fireEvent.change(screen.getByPlaceholderText('Электронная почта для входа'), { target: { value: employee.email } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), { target: { value: employee.phone } });
    fireEvent.change(screen.getByPlaceholderText('Временный пароль (от 8 символов)'), { target: { value: 'secure-pass' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: employee.role } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(employee.fullName)).toBeInTheDocument();
    expect(screen.getByText(employee.email)).toBeInTheDocument();
    expect(screen.getByText(employee.phone)).toBeInTheDocument();
    expect(screen.getByText('Кассир')).toBeInTheDocument();
  });
});
