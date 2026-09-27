import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../auth/auth.store';
import StaffPage from './StaffPage';
import { createGuestOrder } from '../../../guest-web/src/guest-session';

describe('BNP-410 открытие и закрытие смены', () => {
  beforeEach(() => {
    useAuthStore.getState().setAuth('token', { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN', tenantId: 'tenant-1', fullName: 'Admin' });
  });

  it('отображает итоги смены и после закрытия обновляет состояние', async () => {
    let shiftOpen = false;
    let ordersCount = 0;
    let revenue = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/kitchen-staff')) return Promise.resolve({ ok: true, json: async () => [] });
      if (url.endsWith('/admin/shifts/current')) return Promise.resolve({ ok: true, json: async () => shiftOpen ? { id: 'shift-1', openedAt: '2026-09-27T10:00:00Z', cashier: { fullName: 'Иван Петров' }, ordersCount, revenue: revenue.toFixed(2) } : null });
      if (url.endsWith('/admin/shifts/open') && init?.method === 'POST') { shiftOpen = true; return Promise.resolve({ ok: true, json: async () => ({ id: 'shift-1' }) }); }
      if (url.endsWith('/guest/orders') && init?.method === 'POST') {
        const order = JSON.parse(String(init.body)) as { items: Array<{ menuItemId: string }> };
        ordersCount += 1;
        const totalAmountByn = order.items[0]?.menuItemId === 'dish-1' ? 40 : order.items[0]?.menuItemId === 'dish-2' ? 35.5 : 50;
        revenue += totalAmountByn;
        return Promise.resolve({ ok: true, json: async () => ({ orderId: `order-${ordersCount}`, totalAmountByn }) });
      }
      if (url.endsWith('/admin/shifts/close') && init?.method === 'POST') { shiftOpen = false; return Promise.resolve({ ok: true, json: async () => ({}) }); }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StaffPage />);
    expect(await screen.findByRole('button', { name: 'Открыть смену' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Открыть смену' }));
    expect(await screen.findByText(`Открыта: ${new Date('2026-09-27T10:00:00Z').toLocaleString('ru-RU')}`)).toBeInTheDocument();
    expect(await screen.findByText('Кассир: Иван Петров')).toBeInTheDocument();
    expect(screen.getByText('Заказов: 0')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/shifts/open'), expect.objectContaining({ method: 'POST' }));

    const createdOrders = [];
    for (const menuItemId of ['dish-1', 'dish-2', 'dish-3']) {
      createdOrders.push(await createGuestOrder('table-qr-token', {
        items: [{ menuItemId, quantity: 1, selectedModifiers: [] }],
        comment: '',
      }));
    }
    expect(createdOrders).toHaveLength(3);
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url).endsWith('/guest/orders') && init?.method === 'POST')).toHaveLength(3);
    expect(ordersCount).toBe(3);
    expect(revenue).toBe(125.5);

    cleanup();
    render(<StaffPage />);
    expect(await screen.findByText('Заказов: 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть смену' }));
    expect(screen.getByText('Выручка: 125.50 BYN')).toBeInTheDocument();
    expect(screen.getByText('Количество чеков: 3')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть смену' }).at(-1)!);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Открыть смену' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/admin/shifts/close'), expect.objectContaining({ method: 'POST' }));
  });
});
