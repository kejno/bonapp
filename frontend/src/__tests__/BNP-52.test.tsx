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

function renderMenuPage() {
  render(
    <MemoryRouter initialEntries={['/menu/test-cafe?table=table-uuid-1']}>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BNP-52: Ошибка сети или сервера при оформлении — inline-ошибка, корзина не закрывается', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) }),
    );
  });

  it('shows inline error alert on network failure and keeps cart panel open', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );

    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /корзина/i })).toBeInTheDocument();
  });

  it('shows inline error alert on server 500 error and keeps cart panel open', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: false, status: 500 }),
    );

    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /корзина/i })).toBeInTheDocument();
  });

  it('cart items are preserved after error — cart not cleared', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: false, status: 503 }),
    );

    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getAllByText('Кофе').length).toBeGreaterThan(0);
  });
});
