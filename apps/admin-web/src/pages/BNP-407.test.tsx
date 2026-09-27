import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-407 создание сотрудника', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));
  });

  it('сохраняет заданные данные и показывает созданную запись в таблице', async () => {
    const staff = [{ id: 'staff-1', fullName: 'Иван Петров', email: 'ivan@example.com', phone: '+375291234567', role: 'CASHIER', isActive: true, lastLoginAt: null }];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/staff') && init?.method === 'POST') return Promise.resolve({ ok: true, json: async () => staff[0] });
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => staff });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }));

    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить сотрудника' }));
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: 'Иван Петров' } });
    fireEvent.change(screen.getByPlaceholderText('Электронная почта для входа'), { target: { value: 'ivan@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), { target: { value: '+375291234567' } });
    fireEvent.change(screen.getByPlaceholderText('Временный пароль (от 8 символов)'), { target: { value: 'secure-pass' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'CASHIER' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('ivan@example.com')).toBeInTheDocument();
    expect(screen.getByText('+375291234567')).toBeInTheDocument();
    expect(screen.getByText('Кассир')).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/admin/staff'), expect.objectContaining({ method: 'POST', body: expect.stringContaining('ivan@example.com') })));
  });
});
