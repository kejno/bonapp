import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('BNP-390: поиск и фильтры каталога', () => {
  it('показывает совпадения по названию и применяет фильтры стоп-листа и неактивных блюд', async () => {
    useAuthStore.getState().setAuth('token', { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.mocked(menuApi.categories).mockResolvedValue([{ id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true }]);
    vi.mocked(menuApi.items).mockResolvedValue([
      { id: 'dish-1', name: 'Кофе', categoryId: 'cat-1', price: 450, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false },
      { id: 'dish-2', name: 'Чай', categoryId: 'cat-1', price: 350, imageUrl: null, kitchenDepartment: 'Бар', isActive: false, isInStopList: true },
      { id: 'dish-3', name: 'Какао', categoryId: 'cat-1', price: 500, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: true },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);

    expect(await screen.findByRole('button', { name: 'Кофе' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по названию' }), { target: { value: ' КОФ ' } });
    expect(screen.getByRole('button', { name: 'Кофе' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Чай' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск по названию' }), { target: { value: '' } });

    fireEvent.click(screen.getByRole('tab', { name: 'В стоп-листе' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Чай' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Какао' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Кофе' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Неактивные' }));
    expect(screen.getByRole('button', { name: 'Чай' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Какао' })).not.toBeInTheDocument();
  });
});
