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

describe('BNP-388: редактирование блюда в каталоге', () => {
  it('сохраняет изменённые поля блюда из модального окна и обновляет список', async () => {
    useAuthStore.getState().setAuth('token', { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.mocked(menuApi.categories).mockResolvedValue([{ id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true }]);
    const dish = { id: 'dish-1', name: 'Кофе', description: 'Горячий', categoryId: 'cat-1', price: 450, imageUrl: 'https://example.com/coffee.jpg', kitchenDepartment: 'Бар', isActive: true, isInStopList: false };
    vi.mocked(menuApi.items).mockResolvedValue([dish]);
    vi.mocked(menuApi.updateItem).mockResolvedValue({ ...dish, name: 'Капучино', description: 'С молоком', price: 550, imageUrl: 'https://example.com/cappuccino.jpg' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'Кофе' }));
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Капучино' } });
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'С молоком' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '5.5' } });
    fireEvent.change(screen.getByLabelText('Фото (URL)'), { target: { value: 'https://example.com/cappuccino.jpg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(menuApi.updateItem).toHaveBeenCalledWith('token', 'dish-1', {
      name: 'Капучино', categoryId: 'cat-1', price: 550, description: 'С молоком', imageUrl: 'https://example.com/cappuccino.jpg',
    }));
  });
});
