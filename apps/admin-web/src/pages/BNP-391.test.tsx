import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';
import { menuApi } from './menu-api';
import { useAuthStore } from '../auth/auth.store';

vi.mock('./menu-api', () => ({ menuApi: { categories: vi.fn(), items: vi.fn(), createItem: vi.fn(), updateItem: vi.fn(), stopList: vi.fn(), reorder: vi.fn() } }));

afterEach(() => {
  cleanup();
  useAuthStore.getState().clearAuth();
  vi.clearAllMocks();
});

describe('BNP-391: изменение порядка блюд в категории', () => {
  it('перетаскивает третье блюдо на первое место, сразу обновляет таблицу и сохраняет порядок после перезагрузки', async () => {
    useAuthStore.getState().setAuth('token', { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' });
    const category = { id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true };
    const items = [
      { id: 'dish-1', name: 'Эспрессо', categoryId: 'cat-1', price: 350, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false, sortOrder: 0 },
      { id: 'dish-2', name: 'Американо', categoryId: 'cat-1', price: 400, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false, sortOrder: 1 },
      { id: 'dish-3', name: 'Латте', categoryId: 'cat-1', price: 500, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false, sortOrder: 2 },
    ];
    let savedItems = items;
    vi.mocked(menuApi.categories).mockResolvedValue([category]);
    vi.mocked(menuApi.items).mockImplementation(async () => savedItems);
    vi.mocked(menuApi.reorder).mockImplementation(async (_token, _categoryId, ids) => {
      savedItems = ids.map((id, sortOrder) => ({ ...items.find((item) => item.id === id)!, sortOrder }));
    });

    const createClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const renderMenu = (client: QueryClient) => render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    let client = createClient();
    let view = renderMenu(client);
    fireEvent.click(await screen.findByRole('button', { name: 'Напитки' }));

    const table = screen.getByRole('table');
    const rows = () => within(table).getAllByRole('row').slice(1).map((row) => row.textContent);
    await waitFor(() => expect(rows()).toEqual(['⠿Эспрессо3.50 BYNБарАктивно', '⠿Американо4.00 BYNБарАктивно', '⠿Латте5.00 BYNБарАктивно']));

    const dishRows = within(table).getAllByRole('row').slice(1);
    fireEvent.dragStart(dishRows[2]);
    fireEvent.dragOver(dishRows[0]);
    fireEvent.drop(dishRows[0]);

    await waitFor(() => expect(rows()).toEqual(['⠿Латте5.00 BYNБарАктивно', '⠿Эспрессо3.50 BYNБарАктивно', '⠿Американо4.00 BYNБарАктивно']));
    expect(menuApi.reorder).toHaveBeenCalledWith('token', 'cat-1', ['dish-3', 'dish-1', 'dish-2']);

    view.unmount();
    client.clear();
    client = createClient();
    view = renderMenu(client);
    fireEvent.click(await screen.findByRole('button', { name: 'Напитки' }));
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.textContent)).toEqual(['⠿Латте5.00 BYNБарАктивно', '⠿Эспрессо3.50 BYNБарАктивно', '⠿Американо4.00 BYNБарАктивно']));
    view.unmount();
  });
});
