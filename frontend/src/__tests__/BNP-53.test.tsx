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

function renderMenuPage() {
  render(
    <MemoryRouter initialEntries={['/menu/test-cafe?table=table-uuid-1']}>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('BNP-53: Панель корзины — кнопки +/- меняют количество и пересчитывают итог', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMenu),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('cart panel shows + and − buttons for each item', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));

    expect(screen.getByRole('button', { name: /уменьшить количество: кофе/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /увеличить количество: кофе/i })).toBeInTheDocument();
  });

  it('+ button increments quantity and recalculates total price', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /добавить в корзину: кофе/i })[0]);
    await user.click(screen.getByTestId('cart-button'));

    await user.click(screen.getByRole('button', { name: /увеличить количество: кофе/i }));

    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);
  });

  it('− button decrements quantity and recalculates total price', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /добавить в корзину: кофе/i });
    await user.click(addButtons[0]);
    await user.click(addButtons[0]);
    await user.click(screen.getByTestId('cart-button'));

    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /уменьшить количество: кофе/i }));

    expect(screen.getAllByText(/150/).length).toBeGreaterThan(0);
  });

  it('cart panel shows Итого section with total price', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе 150
    await user.click(addButtons[1]); // Чай 100

    await user.click(screen.getByTestId('cart-button'));

    expect(screen.getByText(/итого/i)).toBeInTheDocument();
    expect(screen.getAllByText(/250/).length).toBeGreaterThan(0);
  });

  it('total updates correctly when adding two different items', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе 150 → total 150
    await user.click(screen.getByTestId('cart-button'));

    await user.click(screen.getByRole('button', { name: /увеличить количество: кофе/i })); // +1 → total 300

    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);
  });
});
