import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MenuPage from '../pages/MenuPage.tsx';

const mockMenu = {
  tenantId: 'tenant-uuid-1',
  name: 'Тест Кафе',
  slug: 'test-cafe',
  categories: [
    {
      id: 'cat-1',
      name: 'Напитки',
      sortOrder: 0,
      items: [
        { id: 'item-1', categoryId: 'cat-1', name: 'Кофе', description: null, price: 150, isAvailable: true, imageUrl: null },
        { id: 'item-2', categoryId: 'cat-1', name: 'Чай', description: null, price: 100, isAvailable: true, imageUrl: null },
      ],
    },
  ],
};

function renderMenuPage(table = 'table-uuid-1') {
  render(
    <MemoryRouter initialEntries={[`/menu/test-cafe?table=${table}`]}>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BNP-51: Оформление заказа гостем — экран подтверждения с orderId и очистка корзины', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-bnp51', status: 'NEW' }) }),
    );
  });

  it('shows confirmation screen with orderId after successful order', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
    expect(screen.getByText(/order-bnp51/)).toBeInTheDocument();
    expect(screen.getByText(/официант уточнит детали оплаты/i)).toBeInTheDocument();
  });

  it('clears cart after successful order — floating cart button disappears', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument();
  });

  it('sends POST /public/orders with tenantId, tableId and items', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-2', status: 'NEW' }) });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderMenuPage('table-uuid-99');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());

    const orderCall = fetchMock.mock.calls[1];
    expect(orderCall[0]).toBe('/public/orders');
    const body = JSON.parse(orderCall[1].body as string);
    expect(body.tenantId).toBe('tenant-uuid-1');
    expect(body.tableId).toBe('table-uuid-99');
    expect(body.items).toEqual([{ menuItemId: 'item-1', quantity: 2 }]);
  });

  it('disables submit button during request (loading state)', async () => {
    let resolveOrder!: (v: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockReturnValueOnce(new Promise(res => { resolveOrder = res; }));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    expect(screen.getByRole('button', { name: /оформить заказ/i })).toBeDisabled();

    resolveOrder({ ok: true, json: () => Promise.resolve({ orderId: 'order-1', status: 'NEW' }) });
    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
  });
});
