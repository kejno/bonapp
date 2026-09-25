import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

const requests: Array<{ url: string; method: string }> = [];
const updatePayloads: Array<Record<string, unknown>> = [];
const createPayloads: Array<Record<string, unknown>> = [];
let failNextUpdate = false;
let failGroupsLoad = false;
let pendingUpload: (() => void) | null = null;

beforeEach(() => {
  requests.length = 0;
  updatePayloads.length = 0;
  createPayloads.length = 0;
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
    if (url.endsWith('/menu/items') && method === 'POST') { createPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return Response.json({ id: 'item-1' }); }
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

  it('moves to the tab containing the first invalid field', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.click(screen.getByRole('button', { name: 'POS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Укажите название');
    expect(screen.getByRole('textbox', { name: /Название/ })).toHaveFocus();
  });

  it('shows the validation message beside invalid nutrition fields', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Питание & Аллергены' }));
    fireEvent.change(screen.getByLabelText('Ккал'), { target: { value: '180.5' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Сохранить' }).closest('form')!);
    expect(await screen.findByText('Ккал: укажите целое неотрицательное число')).toBeInTheDocument();
    expect(requests.filter(({ method }) => method === 'POST' || method === 'PUT')).toHaveLength(0);
  });

  it('reuses one client id when a create response is lost', async () => {
    let loseFirstResponse = true;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/menu/items') && init?.method === 'POST') {
        createPayloads.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        if (loseFirstResponse) { loseFirstResponse = false; throw new Error('connection lost after commit'); }
        return Response.json({ id: 'item-1' });
      }
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'category-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items') && init?.method !== 'POST') return Response.json([]);
      if (url.endsWith('/menu/items/item-1')) return Response.json({ id: 'item-1' });
      return Response.json([]);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Добавить блюдо' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Борщ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Категория' }), { target: { value: 'category-1' } });
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Не удалось сохранить блюдо. Проверьте данные и повторите попытку.');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createPayloads).toHaveLength(2);
    expect(createPayloads[0]?.id).toBe(createPayloads[1]?.id);
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

  it('preserves zero for optional numeric fields when saving', async () => {
    failNextUpdate = false;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    await screen.findByText('Борщ');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(await screen.findByLabelText('Себестоимость, BYN'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Питание & Аллергены' }));
    fireEvent.change(screen.getByLabelText('Ккал'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updatePayloads[0]?.costPriceByn).toBe(0);
    expect(updatePayloads[0]?.calories).toBe(0);
  });

  it('keeps persisted modifier deletions pending until save and discards them on cancel', async () => {
    failNextUpdate = false;
    const deleted: string[] = [];
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/menu/items/item-1/modifier-groups')) return Response.json([{ id: 'group-1', name: 'Размер', isRequired: false, minSelection: 0, maxSelection: null, modifierOptions: [{ id: 'option-1', name: 'Большой', extraPriceByn: 1 }] }]);
      if (init?.method === 'DELETE') { deleted.push(url); return new Response(null, { status: 204 }); }
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'category-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items') && init?.method !== 'POST') return Response.json([{ id: 'item-1', name: 'Борщ', categoryId: 'category-1', price: 1200, isActive: true }]);
      return Response.json({ id: 'item-1' });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    await screen.findByText('Борщ');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Модификаторы' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить группу' }));
    expect(deleted).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(deleted).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Модификаторы' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить группу' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleted).toContain('/api/v1/admin/menu/modifier-groups/group-1');
  });
});
