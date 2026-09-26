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

describe('BNP-384: фильтр зоны и статусы столов', () => {
  it('показывает только столы выбранной зоны с их актуальными статусами', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([
      { id: 'main', name: 'Основной зал', sortOrder: 0 },
      { id: 'terrace', name: 'Терраса', sortOrder: 1 },
    ]);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { id: 't1', tableNumber: 1, label: null, seatsCount: 4, areaId: 'main', status: 'AVAILABLE' },
      { id: 't3', tableNumber: 3, label: null, seatsCount: 2, areaId: 'main', status: 'OCCUPIED' },
      { id: 't2', tableNumber: 2, label: null, seatsCount: 2, areaId: 'terrace', status: 'BILL_REQUESTED' },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'Стол 1, Свободен' })).toHaveAttribute('data-status', 'FREE');
    expect(screen.getByRole('button', { name: 'Стол 3, Занят' })).toHaveAttribute('data-status', 'OCCUPIED');
    expect(screen.queryByRole('button', { name: /Стол 2/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Терраса' }));
    expect(screen.queryByRole('button', { name: /Стол 3/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Стол 2, Запрошен счёт' })).toHaveAttribute('data-status', 'BILL_REQUESTED');
  });
});
