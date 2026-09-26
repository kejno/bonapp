import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

describe('BNP-368: menu item photo upload', () => {
  const createPayloads: Record<string, unknown>[] = [];
  beforeEach(() => {
    createPayloads.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/media/presign')) return Response.json({ uploadUrl: '/storage-upload', uploadFields: { key: 'dish.png' }, imageUrl: 'https://cdn.example.com/dish.png' });
      if (url === '/storage-upload') return new Response(null, { status: 204 });
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'cat-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items') && init?.method === 'POST') { createPayloads.push(JSON.parse(String(init.body)) as Record<string, unknown>); return Response.json({ id: 'item-1' }); }
      if (url.endsWith('/menu/items') && init?.method !== 'PUT') return Response.json([]);
      return Response.json({ id: 'item-1' });
    }));
  });

  it('uploads the selected file and persists the returned image URL', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'cat-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Фото'), { target: { files: [new File(['image'], 'dish.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(createPayloads[0]?.imageUrl).toBe('https://cdn.example.com/dish.png'));
  });
});
