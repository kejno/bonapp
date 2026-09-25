import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OrderPage from './OrderPage';
import { getOrder } from '../orders/orders.api';

vi.mock('../orders/orders.api', () => ({ getOrder: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OrderPage', () => {
  it('loads and displays the requested order', async () => {
    vi.mocked(getOrder).mockResolvedValue({
      id: 'order-1', dailyOrderNumber: 42, status: 'NEW', totalAmountByn: '12.50', createdAt: '2026-09-25T12:00:00Z',
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<MemoryRouter initialEntries={['/orders/order-1']}><QueryClientProvider client={queryClient}><Routes><Route path="/orders/:orderId" element={<OrderPage />} /></Routes></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Заказ №42' })).toBeInTheDocument();
    expect(screen.getByText('12.50 BYN')).toBeInTheDocument();
    expect(getOrder).toHaveBeenCalledWith('order-1');
  });
});
