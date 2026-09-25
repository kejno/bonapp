import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

const requests: Array<{ url: string; method: string }> = [];
const updatePayloads: Array<Record<string, unknown>> = [];
let failNextUpdate = false;
let failGroupsLoad = false;
let pendingUpload: (() => void) | null = null;

beforeEach(() => {
  requests.length = 0;
  updatePayloads.length = 0;
  failNextUpdate = true;
  failGroupsLoad = false;
  pendingUpload = null;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (url.endsWith('/menu/items/item-1') && method === 'PUT' && typeof init?.body === 'string') updatePayloads.push(JSON.parse(init.body) as Record<string, unknown>);
    if (url.endsWith('/media/presign')) return Response.json({ uploadUrl: '/upload', uploadFields: {}, imageUrl: 'https://example.com/dish.jpg' });
    if (url === '/upload') await new Promise<void>((resolve) => { pendingUpload = resolve; });
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
  it('waits for the selected photo upload before allowing dish save', async () => {
    failNextUpdate = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    const file = new File(['photo'], 'dish.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Фото'), { target: { files: [file] } });
    await waitFor(() => expect(pendingUpload).toBeTypeOf('function'));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(requests.filter(({ url, method }) => url.endsWith('/menu/items') && method === 'POST')).toHaveLength(0);
    pendingUpload?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updatePayloads[0]?.imageUrl).toBe('https://example.com/dish.jpg');
  });

  it('validates modifier names and selection bounds before making any save request', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Модификаторы' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить группу' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Добавить опцию' }));
    fireEvent.change(screen.getByLabelText('Мин. выбор'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Макс. выбор'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Укажите название группы')).toBeInTheDocument();
    expect(screen.getByText('Укажите название опции')).toBeInTheDocument();
    expect(screen.getByText('Минимальный выбор не может превышать максимальный')).toBeInTheDocument();
    expect(requests.filter(({ method }) => method === 'POST' || method === 'PUT')).toHaveLength(0);
  });

  it('closes the dialog on Escape, traps keyboard focus, and restores focus to its opener', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    const opener = await screen.findByRole('button', { name: 'Добавить блюдо' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    expect(document.activeElement).toBe(focusable[0]);
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

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
