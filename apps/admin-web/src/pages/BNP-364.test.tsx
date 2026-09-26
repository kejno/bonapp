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

describe('BNP-364: изменение стоп-листа блюда', () => {
  it('немедленно отражает переключение и отправляет новое состояние в API', async () => {
    useAuthStore.getState().setAuth('token', { id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin' });
    vi.mocked(menuApi.categories).mockResolvedValue([{ id: 'cat-1', name: 'Напитки', sortOrder: 0, isVisible: true }]);
    vi.mocked(menuApi.items).mockResolvedValue([{ id: 'dish-1', name: 'Кофе', categoryId: 'cat-1', price: 450, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false }]);
    let resolveUpdate!: (value: Awaited<ReturnType<typeof menuApi.stopList>>) => void;
    vi.mocked(menuApi.stopList).mockImplementation(() => new Promise((resolve) => { resolveUpdate = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);

    const toggle = await screen.findByRole('switch', { name: '86 Стоп-лист: Кофе' });
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(menuApi.stopList).toHaveBeenCalledWith('token', 'dish-1', true);
    resolveUpdate({ id: 'dish-1', name: 'Кофе', categoryId: 'cat-1', price: 450, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: true });
  });
});
