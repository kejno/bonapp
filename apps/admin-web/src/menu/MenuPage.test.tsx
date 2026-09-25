import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

const requests: Array<{ url: string; method: string }> = [];
let failNextUpdate = false;
let failGroupsLoad = false;

beforeEach(() => {
  requests.length = 0;
  failNextUpdate = true;
  failGroupsLoad = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (url.endsWith('/menu/items/item-1/modifier-groups') && failGroupsLoad) return new Response(null, { status: 503 });
    if (url.endsWith('/menu/items') && method === 'GET') return Response.json([{ id: 'item-1', name: 'Борщ', categoryId: 'category-1', price: 1200, isActive: true }]);
    if (url.endsWith('/menu/categories')) return Response.json([{ id: 'category-1', name: 'Основное' }]);
    if (url.endsWith('/menu/items') && method === 'POST') return Response.json({ id: 'item-1' });
    if (url.endsWith('/menu/items/item-1') && method === 'PUT' && failNextUpdate) {
      failNextUpdate = false;
      return new Response(null, { status: 503 });
    }
    if (method === 'PUT') return Response.json({ id: 'item-1' });
    return Response.json([]);
  }));
});

describe('MenuPage save retry', () => {
  it('reuses the created dish id when the first update fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Не удалось сохранить блюдо. Проверьте данные и повторите попытку.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(requests.filter(({ url, method }) => url.endsWith('/menu/items') && method === 'POST')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests.filter(({ url, method }) => url.endsWith('/menu/items/item-1') && method === 'PUT')).toHaveLength(2);
  });

  it('shows modifier loading errors and prevents saving the incomplete configuration', async () => {
    failGroupsLoad = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    await screen.findByText('Борщ');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Модификаторы' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить группы модификаторов');
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(requests.filter(({ url, method }) => url.endsWith('/menu/items/item-1') && method === 'PUT')).toHaveLength(0);
  });
});
