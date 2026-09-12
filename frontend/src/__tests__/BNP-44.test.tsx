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

describe('BNP-44: CRUD категорий и позиций без перезагрузки страницы', () => {
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

  it('создаёт категорию: API вызван, форма закрывается, список обновляется', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [cat] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByRole('button', { name: 'Добавить категорию' }));

    await user.click(screen.getByRole('button', { name: 'Добавить категорию' }));
    await user.type(screen.getByLabelText(/Название/), 'Напитки');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.post).toHaveBeenCalledWith('/menu/categories', expect.objectContaining({ name: 'Напитки' }));
    await waitFor(() => expect(screen.getByText(/Напитки/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });

  it('редактирует категорию: форма заполнена данными категории, после сохранения закрывается', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Старое', sortOrder: 0, isVisible: true };
    const updated = { ...cat, name: 'Новое' };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [updated] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Старое/));

    await user.click(screen.getByRole('button', { name: 'Ред.' }));
    const nameInput = screen.getByDisplayValue('Старое');
    await user.clear(nameInput);
    await user.type(nameInput, 'Новое');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.patch).toHaveBeenCalledWith('/menu/categories/c1', expect.objectContaining({ name: 'Новое' }));
    await waitFor(() => expect(screen.getByText(/Новое/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });

  it('удаляет категорию без позиций: DELETE вызван, категория исчезает из списка', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/menu/categories/c1'));
    await waitFor(() => expect(screen.queryByText(/Напитки/)).not.toBeInTheDocument());
  });

  it('создаёт позицию меню: API вызван, позиция появляется в развёрнутой категории', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const item = { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [item] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Добавить позицию' }));

    await user.click(screen.getByRole('button', { name: 'Добавить позицию' }));
    await user.type(screen.getByLabelText(/Название/), 'Кофе');
    await user.type(screen.getByLabelText(/Цена/), '150');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(api.post).toHaveBeenCalledWith('/menu/items', expect.objectContaining({ name: 'Кофе', price: 150 }));
    await waitFor(() => screen.getByText('Кофе'));
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });

  it('удаляет позицию меню: DELETE вызван, позиция исчезает из списка', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const item = { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [item] })
      .mockResolvedValueOnce({ data: [] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));
    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByText('Кофе'));

    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить' });
    await user.click(deleteButtons[1]);

    expect(api.delete).toHaveBeenCalledWith('/menu/items/i1');
    await waitFor(() => expect(screen.queryByText('Кофе')).not.toBeInTheDocument());
  });
});
