import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/axios';
import { AdminMenuPage } from '../pages/AdminMenuPage';

vi.mock('../api/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('BNP-45: Переключатель isAvailable меняется в списке без открытия формы', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('клик по переключателю вызывает PATCH с инвертированным isAvailable, форма редактирования не открывается', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const item = { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' };
    const toggled = { ...item, isAvailable: false };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: [toggled] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByText('Кофе'));

    const toggleBtn = screen.getByRole('button', { name: 'Доступно' });
    await user.click(toggleBtn);

    expect(api.patch).toHaveBeenCalledWith('/menu/items/i1', { isAvailable: false });
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Недоступно' })).toBeInTheDocument());
  });

  it('переключатель недоступного товара активирует его при клике', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const item = { id: 'i1', categoryId: 'c1', name: 'Чай', description: '', price: 100, isAvailable: false, imageUrl: '' };
    const toggled = { ...item, isAvailable: true };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: [toggled] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByText('Чай'));

    await user.click(screen.getByRole('button', { name: 'Недоступно' }));

    expect(api.patch).toHaveBeenCalledWith('/menu/items/i1', { isAvailable: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Доступно' })).toBeInTheDocument());
  });
});
