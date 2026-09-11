import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MenuPage from '../pages/MenuPage.tsx';

const mockMenu = {
  tenantId: 'tenant-1',
  name: 'Тестовое Заведение',
  slug: 'test-venue',
  categories: [
    {
      id: 'cat-1',
      name: 'Напитки',
      sortOrder: 0,
      items: [
        { id: 'item-1', categoryId: 'cat-1', name: 'Кофе', description: 'Эспрессо', price: 150, isAvailable: true, imageUrl: null },
        { id: 'item-2', categoryId: 'cat-1', name: 'Чай', description: null, price: 100, isAvailable: true, imageUrl: null },
      ],
    },
    {
      id: 'cat-2',
      name: 'Еда',
      sortOrder: 1,
      items: [
        { id: 'item-3', categoryId: 'cat-2', name: 'Блины', description: 'С мёдом', price: 250, isAvailable: true, imageUrl: null },
      ],
    },
  ],
};

function renderMenuPage(slug = 'test-venue', table?: string) {
  const path = `/menu/${slug}${table !== undefined ? `?table=${table}` : ''}`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MenuPage', () => {
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

  it('shows skeleton while loading', () => {
    renderMenuPage();
    expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
  });

  it('renders venue name after loading', async () => {
    renderMenuPage();
    await waitFor(() => expect(screen.getByText('Тестовое Заведение')).toBeInTheDocument());
  });

  it('renders categories and items', async () => {
    renderMenuPage();
    await waitFor(() => screen.getByText('Напитки'));
    expect(screen.getByText('Еда')).toBeInTheDocument();
    expect(screen.getByText('Кофе')).toBeInTheDocument();
    expect(screen.getByText('Чай')).toBeInTheDocument();
    expect(screen.getByText('Блины')).toBeInTheDocument();
  });

  it('shows table number in header when ?table= present', async () => {
    renderMenuPage('test-venue', '5');
    await waitFor(() => screen.getByText('Тестовое Заведение'));
    expect(screen.getByText(/Стол 5/)).toBeInTheDocument();
  });

  it('hides table number when ?table= absent', async () => {
    renderMenuPage('test-venue');
    await waitFor(() => screen.getByText('Тестовое Заведение'));
    expect(screen.queryByText(/Стол \d/)).not.toBeInTheDocument();
  });

  it('adds item to cart and shows cart button with count and price', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе 150 ₽

    const cartBtn = screen.getByTestId('cart-button');
    expect(cartBtn).toHaveTextContent('1');
    expect(cartBtn).toHaveTextContent('150');
  });

  it('accumulates total with multiple different items', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе 150
    await user.click(addButtons[1]); // Чай 100

    const cartBtn = screen.getByTestId('cart-button');
    expect(cartBtn).toHaveTextContent('2');
    expect(cartBtn).toHaveTextContent('250');
  });

  it('increments quantity when same item added twice', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе 150
    await user.click(addButtons[0]); // Кофе again

    const cartBtn = screen.getByTestId('cart-button');
    expect(cartBtn).toHaveTextContent('2');
    expect(cartBtn).toHaveTextContent('300');
  });

  it('shows error message when venue not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    renderMenuPage('nonexistent');
    await waitFor(() =>
      expect(screen.getByText(/заведение не найдено/i)).toBeInTheDocument()
    );
  });

  it('shows service unavailable message on server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    renderMenuPage('test-venue');
    await waitFor(() =>
      expect(screen.getByText(/сервис временно недоступен/i)).toBeInTheDocument()
    );
  });

  it('does not render unavailable items', async () => {
    const menuWithUnavailable = {
      ...mockMenu,
      categories: [
        {
          ...mockMenu.categories[0],
          items: [
            ...mockMenu.categories[0].items,
            { id: 'item-99', categoryId: 'cat-1', name: 'Недоступный напиток', description: null, price: 999, isAvailable: false, imageUrl: null },
          ],
        },
        mockMenu.categories[1],
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(menuWithUnavailable),
    }));
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));
    expect(screen.queryByText('Недоступный напиток')).not.toBeInTheDocument();
  });

  it('opens cart panel on cart button click', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);

    const cartBtn = screen.getByTestId('cart-button');
    await user.click(cartBtn);

    expect(screen.getByRole('heading', { name: /корзина/i })).toBeInTheDocument();
  });

  it('decrements item quantity via remove button', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);
    await user.click(addButtons[0]); // quantity = 2

    const cartBtn = screen.getByTestId('cart-button');
    await user.click(cartBtn); // open panel

    const removeBtn = screen.getByRole('button', { name: '−' });
    await user.click(removeBtn); // quantity = 1

    expect(cartBtn).toHaveTextContent('1');
    expect(cartBtn).toHaveTextContent('150');
  });

  it('shows item description when present', async () => {
    renderMenuPage();
    await waitFor(() => screen.getByText('Эспрессо'));
  });

  it('shows item prices', async () => {
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));
    expect(screen.getByText('150 ₽')).toBeInTheDocument();
  });

  // Thread 6: cross-venue cart isolation
  it('isolates cart per venue — does not carry over items from another venue', async () => {
    const user = userEvent.setup();

    renderMenuPage('test-venue');
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе → bonapp_cart_test-venue

    expect(screen.getByTestId('cart-button')).toBeInTheDocument();
    cleanup();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...mockMenu, slug: 'other-venue', name: 'Другое Заведение' }),
    }));

    renderMenuPage('other-venue');
    await waitFor(() => screen.getByText('Другое Заведение'));

    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument();
  });

  // Thread 7: empty category header not rendered
  it('does not render header for a category where all items are unavailable', async () => {
    const menuWithEmptyCategory = {
      ...mockMenu,
      categories: [
        {
          id: 'cat-empty',
          name: 'Временно Недоступные',
          sortOrder: 2,
          items: [
            { id: 'item-off', categoryId: 'cat-empty', name: 'Недоступное', description: null, price: 100, isAvailable: false, imageUrl: null },
          ],
        },
        ...mockMenu.categories,
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(menuWithEmptyCategory),
    }));

    renderMenuPage();
    await waitFor(() => screen.getByText('Напитки'));

    expect(screen.queryByText('Временно Недоступные')).not.toBeInTheDocument();
  });

  // Thread 9: stale tableId cleared on re-visit without ?table=
  it('clears tableId from localStorage when table param is absent on re-visit', async () => {
    renderMenuPage('test-venue', '5');
    await waitFor(() => screen.getByText('Тестовое Заведение'));
    expect(localStorage.getItem('bonapp_table_test-venue')).toBe('5');

    cleanup();

    renderMenuPage('test-venue');
    await waitFor(() => screen.getByText('Тестовое Заведение'));
    expect(localStorage.getItem('bonapp_table_test-venue')).toBeNull();
  });
});
