import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import MenuPage from '../pages/MenuPage.tsx';

function renderMenuPageWithNav(initialSlug: string, table?: string) {
  let capturedNavigate: ReturnType<typeof useNavigate> | null = null;

  function NavigationCapture() {
    capturedNavigate = useNavigate();
    return null;
  }

  const path = `/menu/${initialSlug}${table !== undefined ? `?table=${table}` : ''}`;
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationCapture />
      <Routes>
        <Route path="/menu/:slug" element={<MenuPage />} />
      </Routes>
    </MemoryRouter>
  );

  return { ...result, navigate: (to: string) => capturedNavigate!(to) };
}

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

    const removeBtn = screen.getByRole('button', { name: /уменьшить количество: кофе/i });
    await user.click(removeBtn); // quantity = 1

    expect(cartBtn).toHaveTextContent('1');
    expect(cartBtn).toHaveTextContent('150');
  });

  // Thread 10: state reset on slug change
  it('clears error and shows menu when navigating from errored slug to valid slug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { navigate } = renderMenuPageWithNav('bad-slug');
    await waitFor(() =>
      expect(screen.getByText(/заведение не найдено/i)).toBeInTheDocument()
    );

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMenu),
    }));

    act(() => { navigate('/menu/test-venue'); });

    await waitFor(() =>
      expect(screen.getByText('Тестовое Заведение')).toBeInTheDocument()
    );
    expect(screen.queryByText(/заведение не найдено/i)).not.toBeInTheDocument();
  });

  // Thread 10: old content not visible during fetch after slug change
  it('shows skeleton and not stale menu when navigating to a different slug', async () => {
    const { navigate } = renderMenuPageWithNav('test-venue');
    await waitFor(() => screen.getByText('Тестовое Заведение'));

    // Hang the next fetch so skeleton stays visible
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));

    act(() => { navigate('/menu/venue-b'); });

    await waitFor(() =>
      expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument()
    );
    expect(screen.queryByText('Тестовое Заведение')).not.toBeInTheDocument();
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

  // Thread 14: aria-label on add-to-cart button
  it('add-to-cart button has aria-label with item name', async () => {
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    expect(screen.getByRole('button', { name: /добавить в корзину: кофе/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /добавить в корзину: чай/i })).toBeInTheDocument();
  });

  // Thread 15: cart panel stays open when last item removed
  it('keeps cart panel visible when last item is removed', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // add Кофе

    const cartBtn = screen.getByTestId('cart-button');
    await user.click(cartBtn); // open panel

    const removeBtn = screen.getByRole('button', { name: /уменьшить количество: кофе/i });
    await user.click(removeBtn); // remove last item — cart empty

    // Panel remains visible (empty cart state)
    expect(screen.getByRole('heading', { name: /корзина/i })).toBeInTheDocument();
    // Floating button disappears
    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument();
  });

  // Thread 16: CartPanel ARIA dialog attributes and Escape key
  it('cart panel has role="dialog" with aria-modal and closes on Escape', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);
    await user.click(screen.getByTestId('cart-button'));

    const dialog = screen.getByRole('dialog', { name: /корзина/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // Thread 19: CartPanel receives focus on open so Escape works in real browsers
  it('cart panel receives focus when opened', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);
    await user.click(screen.getByTestId('cart-button'));

    const dialog = screen.getByRole('dialog', { name: /корзина/i });
    expect(dialog).toHaveFocus();
  });

  // Thread 20: CartPanel shows empty state message when cart is emptied
  it('shows empty cart message when all items removed', async () => {
    const user = userEvent.setup();
    renderMenuPage();
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);

    await user.click(screen.getByTestId('cart-button'));

    const removeBtn = screen.getByRole('button', { name: /уменьшить количество: кофе/i });
    await user.click(removeBtn);

    expect(screen.getByText(/корзина пуста/i)).toBeInTheDocument();
  });

  // Thread 23: API validation — category missing items field
  it('shows service unavailable when API returns category without items field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ...mockMenu,
        categories: [{ id: 'cat-1', name: 'Напитки', sortOrder: 0 }], // no items field
      }),
    }));
    renderMenuPage();
    await waitFor(() =>
      expect(screen.getByText(/сервис временно недоступен/i)).toBeInTheDocument()
    );
  });

  // BNP-18: cart panel shows + button and total price
  it('shows + and − buttons and total price in cart panel', async () => {
    const user = userEvent.setup();
    renderMenuPage('test-venue', 'table-1');
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // add Кофе 150
    await user.click(addButtons[0]); // add Кофе again → quantity 2

    await user.click(screen.getByTestId('cart-button'));

    expect(screen.getByRole('button', { name: /уменьшить количество: кофе/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /увеличить количество: кофе/i })).toBeInTheDocument();
    expect(screen.getByText(/итого/i)).toBeInTheDocument();
    expect(screen.getAllByText(/300/).length).toBeGreaterThan(0);
  });

  // BNP-18: place order — success flow
  it('places order and shows confirmation screen with orderId', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-42', status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]);

    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() =>
      expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/order-42/)).toBeInTheDocument();
    expect(screen.getByText(/официант уточнит детали оплаты/i)).toBeInTheDocument();
  });

  // BNP-18: POST body contains tenantId, tableId, items
  it('sends correct POST body to /public/orders', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-1', status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-99');
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе × 1
    await user.click(addButtons[0]); // Кофе × 2

    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());

    const orderCall = fetchMock.mock.calls[1];
    expect(orderCall[0]).toBe('/public/orders');
    const body = JSON.parse(orderCall[1].body as string);
    expect(body.tenantId).toBe('tenant-1');
    expect(body.tableId).toBe('table-uuid-99');
    expect(body.items).toEqual([{ menuItemId: 'item-1', quantity: 2 }]);
  });

  // BNP-18: cart cleared after successful order
  it('clears cart after successful order', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-1', status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /в корзину/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
    expect(screen.queryByTestId('cart-button')).not.toBeInTheDocument();
  });

  // BNP-18: continue order returns to menu with empty cart
  it('returns to menu on "Продолжить заказ" after confirmation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-1', status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /в корзину/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /продолжить заказ/i }));

    expect(screen.queryByText(/ваш заказ принят/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Кофе')).toBeInTheDocument();
  });

  // BNP-18: network error shows inline error, cart stays open
  it('shows inline error on network failure and keeps cart panel open', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockRejectedValueOnce(new TypeError('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /в корзину/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: /корзина/i })).toBeInTheDocument();
  });

  // BNP-18: server error (5xx) shows inline error
  it('shows inline error on server error (5xx)', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /в корзину/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: /корзина/i })).toBeInTheDocument();
  });

  // BNP-18: submit button disabled and shows spinner during request
  it('disables submit button and shows spinner while submitting', async () => {
    const user = userEvent.setup();
    let resolveOrder!: (v: unknown) => void;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockReturnValueOnce(new Promise(res => { resolveOrder = res; }));
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    await user.click(screen.getAllByRole('button', { name: /в корзину/i })[0]);
    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    expect(screen.getByRole('button', { name: /оформить заказ/i })).toBeDisabled();

    await act(async () => {
      resolveOrder({ ok: true, json: () => Promise.resolve({ orderId: 'order-1', status: 'pending' }) });
    });
    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());
  });

  // BNP-18: multiple items in order POST body
  it('sends multiple distinct items in POST body', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockMenu) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ orderId: 'order-99', status: 'pending' }) });
    vi.stubGlobal('fetch', fetchMock);

    renderMenuPage('test-venue', 'table-uuid-1');
    await waitFor(() => screen.getByText('Кофе'));

    const addButtons = screen.getAllByRole('button', { name: /в корзину/i });
    await user.click(addButtons[0]); // Кофе
    await user.click(addButtons[1]); // Чай

    await user.click(screen.getByTestId('cart-button'));
    await user.click(screen.getByRole('button', { name: /оформить заказ/i }));

    await waitFor(() => expect(screen.getByText(/ваш заказ принят/i)).toBeInTheDocument());

    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body.items).toHaveLength(2);
    expect(body.items).toEqual(expect.arrayContaining([
      { menuItemId: 'item-1', quantity: 1 },
      { menuItemId: 'item-2', quantity: 1 },
    ]));
  });
});
