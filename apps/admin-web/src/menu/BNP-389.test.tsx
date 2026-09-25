import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

describe('BNP-389: dish form validation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'cat-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items')) return Response.json([]);
      return Response.json([]);
    }));
  });

  it('shows validation errors and sends no write request for invalid fields', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'cat-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Укажите название')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([, init]) => ['POST', 'PUT'].includes(init?.method ?? 'GET'))).toBe(false));
  });
});
