import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MenuPage from './MenuPage';

describe('BNP-389: dish form validation', () => {
  const originalItem = { id: 'item-1', name: 'Борщ', categoryId: 'cat-1', price: 1200, isActive: true };
  const originalGroup = { id: 'group-1', name: 'Размер', isRequired: true, minSelection: 1, maxSelection: 2, modifierOptions: [{ id: 'option-1', name: 'Большой', extraPriceByn: 2 }] };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/menu/categories')) return Response.json([{ id: 'cat-1', name: 'Основное' }]);
      if (url.endsWith('/menu/items/item-1/modifier-groups')) return Response.json([originalGroup]);
      if (url.endsWith('/menu/items') && init?.method !== 'PUT') return Response.json([originalItem]);
      return Response.json({ id: 'item-1' });
    }));
  });

  it('keeps an existing dish unchanged when its name and modifier selection range are invalid', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MenuPage /></QueryClientProvider>);

    await screen.findByText('Борщ');
    fireEvent.click(screen.getByRole('button', { name: 'Редактировать' }));
    await screen.findByRole('textbox', { name: 'Название' });
    const save = screen.getByRole('button', { name: 'Сохранить' });

    fireEvent.click(screen.getByRole('button', { name: 'Основное' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Модификаторы' }));
    await screen.findByDisplayValue('Размер');
    fireEvent.change(screen.getByLabelText('Мин. выбор'), { target: { value: '3' } });

    fireEvent.click(save);
    expect(await screen.findByText('Укажите название')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => ['POST', 'PUT', 'DELETE'].includes(init?.method ?? 'GET'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Модификаторы' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Борщ')).toBeInTheDocument();
    expect(screen.getByText('12.00 BYN')).toBeInTheDocument();
    expect(screen.getByText('Минимальный выбор не может превышать максимальный')).toBeInTheDocument();
  });
});
