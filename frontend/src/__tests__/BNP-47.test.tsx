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

describe('BNP-47: Ошибки API отображаются inline без перезагрузки страницы', () => {
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

  it('ошибка создания категории отображается inline, форма остаётся открытой', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByRole('button', { name: 'Добавить категорию' }));

    await user.click(screen.getByRole('button', { name: 'Добавить категорию' }));
    await user.type(screen.getByLabelText(/Название/), 'Тест');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(screen.getByText('Не удалось сохранить категорию')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Добавить категорию' })).toBeInTheDocument();
  });

  it('ошибка редактирования категории отображается inline', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    vi.mocked(api.get).mockResolvedValueOnce({ data: [cat] });
    vi.mocked(api.patch).mockRejectedValue(new Error('Server error'));

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Ред.' }));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(screen.getByText('Не удалось сохранить категорию')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Напитки/)).toBeInTheDocument();
  });

  it('ошибка создания позиции отображается inline', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.post).mockRejectedValue(new Error('Network error'));

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByRole('button', { name: 'Добавить позицию' }));

    await user.click(screen.getByRole('button', { name: 'Добавить позицию' }));
    await user.type(screen.getByLabelText(/Название/), 'Кофе');
    await user.type(screen.getByLabelText(/Цена/), '150');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(screen.getByText('Не удалось сохранить позицию')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Напитки/ })).toBeInTheDocument();
  });

  it('ошибка удаления категории отображается inline, категория остаётся в списке', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.delete).mockRejectedValue(new Error('Server error'));

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() =>
      expect(screen.getByText('Не удалось удалить категорию')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Напитки/)).toBeInTheDocument();
  });

  it('ошибка переключения доступности позиции отображается inline', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const item = { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: [item] });
    vi.mocked(api.patch).mockRejectedValue(new Error('Network error'));

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByText(/Кофе/));

    await user.click(screen.getByRole('button', { name: 'Доступно' }));

    await waitFor(() =>
      expect(screen.getByText('Не удалось изменить доступность')).toBeInTheDocument(),
    );
  });
});
