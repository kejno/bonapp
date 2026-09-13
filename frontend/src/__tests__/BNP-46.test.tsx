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

describe('BNP-46: Удаление категории с позициями — диалог подтверждения с количеством позиций', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue({ data: [] });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    vi.mocked(api.delete).mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('показывает диалог подтверждения с количеством позиций при удалении категории с 2 позициями', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' },
      { id: 'i2', categoryId: 'c1', name: 'Чай', description: '', price: 100, isAvailable: true, imageUrl: '' },
    ];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: items });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('показывает диалог с количеством 1 при удалении категории с одной позицией', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' },
    ];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: items });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('1'));
    expect(api.delete).not.toHaveBeenCalled();
  });

  it('отмена диалога сохраняет категорию в списке', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: items });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText(/Напитки/)).toBeInTheDocument();
  });

  it('подтверждение удаляет категорию с позициями', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' },
    ];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: items })
      .mockResolvedValueOnce({ data: [] });

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    await user.click(screen.getByRole('button', { name: 'Удалить' }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/menu/categories/c1'));
    await waitFor(() => expect(screen.queryByText(/Напитки/)).not.toBeInTheDocument());
  });

  it('использует кэшированный список позиций если категория уже раскрыта', async () => {
    const user = userEvent.setup();
    const cat = { id: 'c1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'i1', categoryId: 'c1', name: 'Кофе', description: '', price: 150, isAvailable: true, imageUrl: '' },
      { id: 'i2', categoryId: 'c1', name: 'Чай', description: '', price: 100, isAvailable: true, imageUrl: '' },
      { id: 'i3', categoryId: 'c1', name: 'Сок', description: '', price: 120, isAvailable: true, imageUrl: '' },
    ];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat] })
      .mockResolvedValueOnce({ data: items }); // loaded when accordion expanded

    render(<AdminMenuPage />);
    await waitFor(() => screen.getByText(/Напитки/));

    // Expand accordion first — items get cached
    await user.click(screen.getByRole('button', { name: /Напитки/ }));
    await waitFor(() => screen.getByText(/Кофе/));

    await user.click(screen.getAllByRole('button', { name: 'Удалить' })[0]);

    // Confirm should use cached count (3), no extra GET call
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(2); // initial + items load
  });
});
