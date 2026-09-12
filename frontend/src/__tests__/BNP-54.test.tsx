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

async function placeOrderFlow(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => screen.getByText('Кофе'));
  await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
  await user.click(screen.getByTestId('cart-button'));
  await user.click(screen.getByRole('button', { name: /оформить заказ/i }));
  await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
}

describe('BNP-54: Кнопка «Продолжить заказ» — возврат в меню с пустой корзиной и сохранённым tableId', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-bnp54', status: 'NEW' }) }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('clicking «Продолжить заказ» dismisses confirmation screen', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await placeOrderFlow(user);

    await user.click(screen.getByRole('button', { name: /продолжить заказ/i }));

    expect(screen.queryByText(/ваш заказ принят/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns to menu with menu items visible after clicking «Продолжить заказ»', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await placeOrderFlow(user);

    await user.click(screen.getByRole('button', { name: /продолжить заказ/i }));

    expect(screen.getByText('Кофе')).toBeInTheDocument();
  });

  it('cart is empty after «Продолжить заказ» — floating cart button not visible', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await placeOrderFlow(user);

    await user.click(screen.getByRole('button', { name: /продолжить заказ/i }));

    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument();
  });

  it('tableId is preserved in header after returning to menu (allows repeat order without QR)', async () => {
    const user = userEvent.setup();
    renderMenuPage('table-uuid-42');
    await placeOrderFlow(user);

    await user.click(screen.getByRole('button', { name: /продолжить заказ/i }));

    expect(screen.getByText(/Стол table-uuid-42/i)).toBeInTheDocument();
  });
});
