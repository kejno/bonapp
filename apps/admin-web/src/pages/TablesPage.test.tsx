import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
  return render(<QueryClientProvider client={client}><TablesPage /></QueryClientProvider>);
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

  it('opens table details without offering manual status changes', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue(areas);
    vi.mocked(tablesApi.getTables).mockResolvedValue(tables);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Стол 1/ }));
    expect(screen.getAllByText('У окна')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Изменить стол' })).toBeInTheDocument();
    expect(screen.queryByText(/Изменить статус/)).not.toBeInTheDocument();
  });
});
