import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '../api/axios';
import { AdminMenuPage as MenuPage } from './AdminMenuPage';

vi.mock('../api/axios', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const cat1 = { id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true };
const cat2 = { id: 'cat-2', name: 'Еда', sortOrder: 1, isVisible: true };
const item1 = { id: 'item-1', categoryId: 'cat-1', name: 'Вода', price: 50.0, isAvailable: true };

describe('MenuPage — handleDeleteCategory', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('loads items and shows confirm with count when deleting category with unloaded cache', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockResolvedValueOnce({ data: [item1] });

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(api.get).toHaveBeenCalledWith('/menu/items?categoryId=cat-1');
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('1 позицию'));
  });

  it('deletes category without confirm when it has no items', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    vi.mocked(api.delete).mockResolvedValueOnce({});

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith('/menu/categories/cat-1');
  });

  it('uses correct pluralization for 21 items in delete confirm', async () => {
    const manyItems = Array.from({ length: 21 }, (_, i) => ({
      id: `item-${i}`,
      categoryId: 'cat-1',
      name: `Item ${i}`,
      price: 10.0,
      isAvailable: true,
    }));

    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockResolvedValueOnce({ data: manyItems });

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('21 позицию'));
  });

  it('does not delete category when loadItems fails during delete', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockRejectedValueOnce(new Error('Network error'));

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText(/Не удалось загрузить позиции — удаление отменено/)).toBeInTheDocument();
  });
});

describe('MenuPage — handleSaveItem category change', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('refetches both old and new category after moving item to different category', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1, cat2] })
      .mockResolvedValueOnce({ data: [item1] });

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: /Напитки/ }));
    await screen.findByText('Вода');

    const editButtons = screen.getAllByRole('button', { name: 'Ред.' });
    // DOM order: cat1-edit(0), item1-edit(1), cat2-edit(2) — pick item's button
    await userEvent.click(editButtons[1]);

    const categorySelect = screen.getByLabelText(/Категория/);
    await userEvent.selectOptions(categorySelect, 'cat-2');

    vi.mocked(api.patch).mockResolvedValueOnce({ data: {} });
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    const allGetCalls = vi.mocked(api.get).mock.calls as [string][];
    const itemCalls = allGetCalls.filter(([url]) => url.includes('/menu/items'));
    expect(itemCalls.some(([url]) => url.includes('cat-2'))).toBe(true);
    expect(itemCalls.some(([url]) => url.includes('cat-1'))).toBe(true);
    const cat1Calls = itemCalls.filter(([url]) => url.includes('cat-1'));
    expect(cat1Calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('MenuPage — handleDeleteItem', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('shows confirm with item name before deleting an item', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockResolvedValueOnce({ data: [item1] });

    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });

    await userEvent.click(screen.getByRole('button', { name: /Напитки/ }));
    await screen.findByText('Вода');

    const deleteButtons = screen.getAllByRole('button', { name: 'Удалить' });
    await userEvent.click(deleteButtons[deleteButtons.length - 1]);

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Вода'));
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('MenuPage — handleToggleAvailability', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('sends PATCH with toggled isAvailable and refetches the category', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: [cat1] })
      .mockResolvedValueOnce({ data: [item1] })
      .mockResolvedValueOnce({ data: [{ ...item1, isAvailable: false }] });

    vi.mocked(api.patch).mockResolvedValueOnce({});

    render(<MenuPage />);
    await screen.findByRole('button', { name: /Напитки/ });
    await userEvent.click(screen.getByRole('button', { name: /Напитки/ }));
    await screen.findByText('Вода');

    await userEvent.click(screen.getByRole('button', { name: 'Доступно' }));

    expect(api.patch).toHaveBeenCalledWith('/menu/items/item-1', { isAvailable: false });
    const allGetCalls = vi.mocked(api.get).mock.calls as [string][];
    expect(allGetCalls.some(([url]) => url.includes('/menu/items?categoryId=cat-1'))).toBe(true);
  });
});
