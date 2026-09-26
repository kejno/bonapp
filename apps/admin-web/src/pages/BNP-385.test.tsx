import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TablesPage from './TablesPage';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  getAreas: vi.fn(), getTables: vi.fn(), createTable: vi.fn(), updateTable: vi.fn(), generateQrPdf: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('BNP-385: подробности стола', () => {
  it('показывает номер, гостя и текущий заказ с переходом к заказу', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([{ id: 'main', name: 'Основной зал', sortOrder: 0 }]);
    vi.mocked(tablesApi.getTables).mockResolvedValue([{
      id: 't1', tableNumber: 4, label: 'У окна', seatsCount: 4, areaId: 'main', status: 'OCCUPIED',
      orders: [{ id: 'order-42', status: 'IN_PROGRESS', totalAmountByn: 18, guestSessionId: 'guest-7' }],
    }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /Стол 4/ }));
    expect(screen.getByRole('heading', { name: 'Стол 4' })).toBeInTheDocument();
    expect(screen.getByText('Гость без учётной записи')).toBeInTheDocument();
    expect(screen.getByText('guest-7')).toBeInTheDocument();
    expect(screen.getByText(/Заказ order-42 · IN_PROGRESS · 18 BYN/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть заказ' })).toHaveAttribute('href', '/orders/order-42');
  });
});
