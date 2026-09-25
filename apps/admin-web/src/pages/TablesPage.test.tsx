import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TablesPage from './TablesPage';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  getAreas: vi.fn(),
  getTables: vi.fn(),
  createTable: vi.fn(),
  updateTable: vi.fn(),
  generateQrPdf: vi.fn(),
}));

const areas = [
  { id: 'main', name: 'Основной зал', sortOrder: 0 },
  { id: 'terrace', name: 'Терраса', sortOrder: 1 },
];
const tables = [
  { id: 't1', tableNumber: 1, label: 'У окна', seatsCount: 4, areaId: 'main', status: 'AVAILABLE' },
  { id: 't2', tableNumber: 2, label: null, seatsCount: 2, areaId: 'main', status: 'OCCUPIED' },
  { id: 't3', tableNumber: 3, label: null, seatsCount: 2, areaId: 'terrace', status: 'BILL_REQUESTED' },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TablesPage', () => {
  it('shows zone tabs and status colors for tables in the selected zone', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue(tables);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Основной зал' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Стол 1/ })).toHaveAttribute('data-status', 'FREE');
    expect(screen.getByRole('button', { name: /Стол 2/ })).toHaveAttribute('data-status', 'OCCUPIED');
    expect(screen.queryByRole('button', { name: /Стол 3/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Терраса' }));
    expect(screen.getByRole('button', { name: /Стол 3/ })).toHaveAttribute('data-status', 'BILL_REQUESTED');
  });

  it('shows unknown statuses with a neutral color and their actual value', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { ...tables[0], status: 'RESERVED' },
    ]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Стол 1, RESERVED' })).toHaveAttribute('data-status', 'UNKNOWN');
    expect(screen.getByText('RESERVED')).toBeInTheDocument();
  });

  it('creates a table in the selected zone', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue(tables);
    vi.mocked(tablesApi.createTable).mockResolvedValue(tables[0]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: '+ Добавить стол' }));
    fireEvent.change(screen.getByLabelText('Номер стола'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Количество мест'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(tablesApi.createTable).toHaveBeenCalledWith({
      tableNumber: 8, seatsCount: 5, areaId: 'main', label: undefined,
    }));
  });

  it('clears a table label when saving an edit with an empty label', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue(tables);
    vi.mocked(tablesApi.updateTable).mockResolvedValue({ ...tables[0], label: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Стол 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Изменить стол' }));
    fireEvent.change(screen.getByLabelText('Метка'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(tablesApi.updateTable).toHaveBeenCalledWith('t1', {
      tableNumber: 1, label: null, seatsCount: 4, areaId: 'main',
    }));
  });

  it('opens table details without offering manual status changes', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue(tables);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Стол 1/ }));
    expect(screen.getAllByText('У окна')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Изменить стол' })).toBeInTheDocument();
    expect(screen.queryByText(/Изменить статус/)).not.toBeInTheDocument();
  });

  it('links the current order to its details screen', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { ...tables[0], orders: [{ id: 'order-1', status: 'IN_PROGRESS', totalAmountByn: 12, guestSessionId: null }] },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Стол 1/ }));
    expect(screen.getByText(/Заказ order-1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть заказ' })).toHaveAttribute('href', '/orders/order-1');
  });

  it('shows the guest session associated with the current order', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { ...tables[0], orders: [{ id: 'order-1', status: 'IN_PROGRESS', totalAmountByn: 12, guestSessionId: 'guest-session-1' }] },
    ]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Стол 1/ }));
    expect(screen.getByText('ID сессии гостя')).toBeInTheDocument();
    expect(screen.getByText('guest-session-1')).toBeInTheDocument();
  });
});
