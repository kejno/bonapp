import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';

describe('BNP-472 валидация обязательных данных сотрудника', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => null });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  async function openForm() {
    render(<StaffPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить сотрудника' }));
    fireEvent.change(screen.getByPlaceholderText('Электронная почта для входа'), { target: { value: 'new.employee@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), { target: { value: '+375291234567' } });
    fireEvent.change(screen.getByPlaceholderText('Временный пароль (от 8 символов)'), { target: { value: 'valid-password' } });
  }

  it('не сохраняет сотрудника с пустым именем и показывает ошибку поля', async () => {
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Укажите имя')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/admin/staff'), expect.objectContaining({ method: 'POST' })));
    expect(screen.getByRole('heading', { name: 'Новый сотрудник' })).toBeInTheDocument();
  });

  it('не сохраняет сотрудника с телефоном в неверном формате', async () => {
    await openForm();
    fireEvent.change(screen.getByPlaceholderText('Имя'), { target: { value: 'Иван Петров' } });
    fireEvent.change(screen.getByPlaceholderText('Телефон'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Введите телефон в формате +375XXXXXXXXX')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/admin/staff'), expect.objectContaining({ method: 'POST' })));
    expect(screen.getByRole('heading', { name: 'Новый сотрудник' })).toBeInTheDocument();
  });
});
