import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

describe('BNP-388: edit dish in all tabs', () => {
  const payloads: Record<string, unknown>[] = [];
  beforeEach(() => {
    payloads.length = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'cat-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items/item-1/modifier-groups')) return Response.json([{ id: 'group-1', name: 'Размер', isRequired: true, minSelection: 1, maxSelection: 1, modifierOptions: [{ id: 'option-1', name: 'Большой', extraPriceByn: 2 }] }]);
      if (url.endsWith('/menu/items') && init?.method !== 'PUT') return Response.json([{ id: 'item-1', name: 'Борщ', categoryId: 'cat-1', price: 1200, isActive: true }]);
      if (url.endsWith('/menu/items/item-1') && init?.method === 'PUT') { payloads.push(JSON.parse(String(init.body)) as Record<string, unknown>); return Response.json({ id: 'item-1' }); }
      return Response.json({ id: 'item-1' });
    }));
  });

  it('saves changes from the main, modifier, nutrition, and POS tabs', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);
    await screen.findByText('Борщ');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    fireEvent.change(screen.getByLabelText('Цена, BYN'), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Модификаторы' }));
    await screen.findByDisplayValue('Размер');
    fireEvent.change(screen.getByLabelText('Название группы'), { target: { value: 'Объём' } });
    fireEvent.click(screen.getByRole('button', { name: 'Питание & Аллергены' }));
    fireEvent.change(screen.getByLabelText('Ккал'), { target: { value: '180' } });
    fireEvent.click(screen.getByRole('button', { name: 'POS' }));
    fireEvent.change(screen.getByLabelText('Идентификатор позиции POS'), { target: { value: 'pos-42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(payloads[0]).toMatchObject({ price: 1500, calories: 180, posItemId: 'pos-42' });
    expect(payloads[0]).toHaveProperty('name', 'Борщ');
  });
});
