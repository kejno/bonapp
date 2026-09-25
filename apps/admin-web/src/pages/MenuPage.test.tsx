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

describe('MenuPage', () => {
  it('opens an existing dish for editing and saves its fields', async () => {
    useAuthStore.getState().setAuth('token', { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.mocked(menuApi.categories).mockResolvedValue([{ id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true }]);
    vi.mocked(menuApi.items).mockResolvedValue([{ id: 'dish-1', name: 'Кофе', description: 'Горячий', categoryId: 'cat-1', price: 450, imageUrl: 'https://example.com/coffee.jpg', kitchenDepartment: 'Бар', isActive: true, isInStopList: false }]);
    vi.mocked(menuApi.updateItem).mockResolvedValue({ id: 'dish-1', name: 'Кофе', categoryId: 'cat-1', price: 500, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'Кофе' }));
    expect(screen.getByRole('heading', { name: 'Редактирование блюда' })).toBeInTheDocument();
    expect(screen.getByLabelText('Описание')).toHaveValue('Горячий');
    expect(screen.getByLabelText('Цена, BYN')).toHaveValue(4.5);
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(menuApi.updateItem).toHaveBeenCalledWith('token', 'dish-1', expect.objectContaining({ name: 'Кофе', categoryId: 'cat-1', price: 500, description: 'Горячий', imageUrl: 'https://example.com/coffee.jpg' })));
  });
});
